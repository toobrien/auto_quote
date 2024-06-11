const { base_client, mdf }  = require("./ibkr/base_client");
const { format }            = require("date-fns");
const readline              = require("readline");
const fs                    = require("node:fs");
const IN_MAP                = {};


// node v2.js 620731036 0.25 5 7 10000


// order


class order {

    constructor(id, side, type, args) {

        this.id     = id;
        this.side   = side;
        this.type   = type;
        this.status = null;
        this.args   = args;

    }

}


// functions


function update_screen() {

    for (let i = 0; i < process.stdout.rows; i++) {

        process.stdout.cursorTo(0, i);
        process.stdout.clearLine(0);
    
    }

    process.stdout.cursorTo(0, 0);

    process.stdout.write(`${"heartbeat:".padStart(COL_WIDTH)}${String(HEARTBEAT).padStart(COL_WIDTH)}\n`);
    process.stdout.write(`${"l1:".padStart(COL_WIDTH)}${String(L1_BID_PX).padStart(COL_WIDTH)}${String(L1_ASK_PX).padStart(COL_WIDTH)}\n`);

    for (let [ _, o ] of Object.entries(ORDERS)) {

        let offset = o.side == "BUY" ? (L1_BID_PX - o.args.price) : o.args.price - L1_ASK_PX;
        
        offset /= TICK_SIZE;
        
        let fields = [
            o.id.padStart(COL_WIDTH),
            o.side.padStart(COL_WIDTH),
            String(o.args.price).padStart(COL_WIDTH),
            o.type.padStart(COL_WIDTH),
            String(o.status).padStart(COL_WIDTH),
            String(offset).padStart(COL_WIDTH)
        ];
        
        let line = `${fields[0]}${fields[1]}${fields[2]}${fields[3]}${fields[4]}${fields[5]}\n`;

        process.stdout.write(line);

    }

}


async function update_quote(side, l1) {

    for (let [ _, o ] of Object.entries(ORDERS)) {

        if (o.type == "quote" && o.side == side) {

            let level = Math.abs(o.args.price - l1);

            if (level > MAX_OFFSET || level < MIN_OFFSET) {
                
                o.args.price = side == "BUY" ? l1 - MIN_OFFSET : l1 + MIN_OFFSET;

                let modify_order_res = await modify_order(o);

                // dont retry on error, let next update_quote attempt to handle it

            }

        }

    }

}


async function exit() {

    let place_order_res = { error: 1 }

    while(place_order_res.error) {

        await new Promise(resolve => setTimeout(resolve, LAG));

        place_order_res = await place_order(null, "exit", null);

    }

}

function check_quote(side) {

    let exists = false;

    for (let o of Object.values(ORDERS)) {

        exists = (o.type == "quote" && o.side == side) ? true : exists;

    }

    return exists;

}


async function handle_order_msg(msg) {

    for (let args of msg.args) {

        //fs.writeFile(LOG_FILE, `${JSON.stringify(args)}\n`, { flag: "a+" }, LOG_ERR);

        let status      = args.status;
        let order_id    = args.orderId;
        let o           = ORDERS[order_id];

        if (!o) {

            // new order: should be added shortly by place_order
            // cancel/replace by IBKR: cancel and wait for init_quote

            if (
                args.conid      == CONID    &&
                args.orderType  == "Limit"  && 
                check_quote(args.side)
            ) {

                let cancel_order_res = { error: 1 };
                
                o = new order(order_id, args.side, "quote", { price: args.price });
                
                while (cancel_order_res.error) {

                    cancel_order(o);

                    if (cancel_order_res.error)

                        await new Promise(resolve => setTimeout(resolve, LAG));

                }

                fs.writeFile(LOG_FILE, `{"ts":${format(Date.now(), FMT)},"lvl":"INFO","fn":"handle_order_msg","msg": cancelled duplicate ${args.side} quote @ ${args.price}"}\n`, { flag: "a+" }, LOG_ERR);

            }

            return;
        
        }

        o.status = status;

        let log_msg = {
            ts:         format(Date.now(), FMT),
            lvl:        "INFO",
            fn:         "handle_order_msg",
            id:         o.id,
            side:       o.side,
            status:     o.status,
            type:       o.type,
            price:      o.args.price
        };

        switch(status) {

            case "Filled":

                // TODO: handle whatever quantity was actually filled
                
                POSITION = o.side == "BUY" ? POSITION + 1 : POSITION - 1;

                log_msg.position    = POSITION;
                log_msg.fill_px     = args.avgPrice;
                
                if (ORDERS[order_id])
                
                    delete ORDERS[order_id];

                if (o.type == "quote") {

                    o.fill_px = parseFloat(args.avgPrice);

                    await exit();

                } else if (o.type == "exit") {

                    // requote

                    let side            = o.side    == "BUY" ? "SELL" : "BUY";
                    let price           = side      == "BUY" ? L1_BID_PX - MIN_OFFSET : L1_ASK_PX + MIN_OFFSET;
                    let place_order_res = { error: 1 };
                    
                    while (place_order_res.error) {
                    
                        place_order_res = await place_order(side, "quote", price, true);

                        if (place_order_res.error)

                            await new Promise(resolve => setTimeout(resolve, LAG));

                    }

                }

                break;

            case "Cancelled":

                if (ORDERS[order_id])

                    delete ORDERS[order_id];

                break;

            case "Submitted":

                ;

            case "PreSubmitted":

                ;

            case "PendingSubmit":

                ;

            case "PendingCancel":

                ;

            case "Inactive":

                ;

            default:

                break;

        }

        if (LOGGING)  

            fs.writeFile(LOG_FILE,`${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

}


function handle_system_msg(msg) {

    if (msg.hb) HEARTBEAT = 0;

}


function handle_market_data_msg(msg) {

    if (msg[mdf.bid]) {

        L1_BID_PX = parseFloat(msg[mdf.bid]);

        update_quote("BUY", L1_BID_PX);

    }

    if (msg[mdf.ask]) {
        
        L1_ASK_PX = parseFloat(msg[mdf.ask]);

        update_quote("SELL", L1_ASK_PX);

    }

}


function ws_handler(evt) {

    if (!evt.data) return;
    
    let msg = JSON.parse(evt.data);

    switch(msg.topic) {

        case `smd+${CONID}`:

            handle_market_data_msg(msg);
            update_screen();

            break;
        
        case "system":

            handle_system_msg(msg);
            update_screen();

            break;

        case "sor":

            handle_order_msg(msg);
            update_screen();

            break;

        default:

            break;

    }

}


async function init_quote() {

    if (L1_BID_PX && L1_ASK_PX) {

        let place_order_res = { error: 1 };
        let order_params    = [
                                [ "BUY", "quote", L1_BID_PX - MIN_OFFSET ],
                                [ "SELL", "quote", L1_ASK_PX + MIN_OFFSET ]
                            ];
    
        for (let order of order_params) {
    
            while (place_order_res.error) {
            
                place_order_res = await place_order(...order);

                if (place_order_res.error)

                    await new Promise(resolve => setTimeout(resolve, LAG));

            }
    
            place_order_res = { error: 1 };
    
        }

    }

}


async function clear_quote() {

    for (let [ _, o ] of Object.entries(ORDERS)) {

        if (o.type == "quote") {

            let cancel_order_res = { error: 1 };

            while (cancel_order_res.error) {

                cancel_order_res = await cancel_order(o);

                if (cancel_order_res.error)

                    await new Promise(resolve => setTimeout(resolve, LAG));

            }

            if (ORDERS[o.id])

                delete ORDERS[o.id];

        }

    }

}

async function quit() {

    await clear_quote();
    
    process.exit();

}


async function ack_order(place_order_res) {
    
    let t0              = Date.now();
    let res             = {};
    let message_id      = place_order_res[0].id;
    let ack_order_res   = res = await CLIENT.reply(message_id);

    if (LOGGING) {

        let log_msg = {
            ts:     format(t0, FMT),
            lvl:    "INFO",
            fn:     "ack_order",
            msg:    JSON.stringify(ack_order_res),
            ms:     Date.now() - t0
        };

        fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    return ack_order_res;

}


async function place_order(
    side,
    type,
    price
) {

    let t0      = Date.now();
    let res     = {}
    let args    = {
                    orders: [
                        {
                            acctId:     ACCOUNT_ID,
                            conid:      CONID,
                            side:       side,
                            tif:        "GTC",
                            quantity:   1
                        }
                    ]
                };

    if (type == "quote") {

        if (check_quote(side)) {

            fs.writeFile(LOG_FILE, `{"ts":${format(Date.now(), FMT)},"lvl":"INFO","fn":"place_order","msg":"duplicate ${side} quote requested"}\n`, { flag: "a+" }, LOG_ERR);

            return res;
        }

        args.orders[0].price        = price;
        args.orders[0].orderType    = "LMT";

    } else if (type == "exit") {

        side = POSITION < 0 ? "BUY" : POSITION > 0 ? "SELL" : null;

        if (!side) {

            fs.writeFile(LOG_FILE, `{"ts":${format(Date.now(), FMT)},"lvl":"INFO","fn":"place_order","msg":"flat, ${side} market ignored"}\n`, { flag: "a+" }, LOG_ERR);

            return res;

        }

        args.orders[0].orderType    = "MKT";
        args.orders[0].side         = side;

    }


    let place_order_res = await CLIENT.place_order(ACCOUNT_ID, args);

    if (place_order_res.error) {

        fs.writeFile(LOG_FILE, `{"ts":${format(Date.now(), FMT)},"lvl":"ERROR","fn":"place_order","msg":"${place_order_res.error}"}\n`, { flag: "a+" }, LOG_ERR);

        res = place_order_res;

        return res;

    }

    let ack_order_res = await ack_order(place_order_res);

    if (ack_order_res.error) {

        fs.writeFile(LOG_FILE, `{"ts":${format(Date.now(), FMT)},"lvl":"ERROR","fn":"ack_order","msg":"${ack_order_res.error}"}\n`, { flag: "a+" }, LOG_ERR);

        res = ack_order_res;

        return res;
    
    }

    let id      = ack_order_res[0].order_id;
    let o       = new order(id, side, type, args.orders[0]);
    ORDERS[id]  = o;

    if (LOGGING) {

        let log_msg = {
            ts:     format(t0, FMT),
            lvl:    "INFO",
            fn:     "place_order",
            ms:     Date.now() - t0,
            id:     o.id,
            side:   o.side,
            status: o.status,
            type:   o.type,
            price:  o.args.price
        };

        fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    res = { order: o }

    return res;

}


async function modify_order(o) {

    let t0                  = Date.now();
    let modify_order_res    = await CLIENT.modify_order(ACCOUNT_ID, o.id, o.args);

    if (modify_order_res.error) {

        fs.writeFile(LOG_FILE, `"ts":"${format(Date.now(), FMT)}","lvl":"ERROR","fn":"modfiy_order","msg":"${modify_order_res.error}"}\n`, { flag: "a+" }, LOG_ERR);

        return modify_order_res;

    }

    if (LOGGING) {

        let log_msg = {
            ts:     format(t0, FMT),
            lvl:    "INFO",
            fn:     "modify_order",
            ms:     Date.now() - t0,
            id:     o.id,
            side:   o.side,
            status: o.status,
            type:   o.type,
            price:  o.args.price
        };

        fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    return {};

}


async function cancel_order(o) {

    let t0                  = Date.now();
    let cancel_order_res    = await CLIENT.cancel_order(ACCOUNT_ID, o.id);

    if (cancel_order_res.error) {

        let err_msg = {
            ts:     format(Date.now(), FMT),
            lvl:    "ERROR",
            fn:     "cancel_order",
            msg:    cancel_order_res.error

        }

        fs.writeFile(LOG_FILE, `${JSON.stringify(err_msg)}\n`, { flag: "a+" }, LOG_ERR);

        return cancel_order_res;

    }

    if (LOGGING) {

        let log_msg = {
            ts:     format(t0, FMT),
            lvl:    "INFO",
            fn:     "cancel_order",
            ms:     Date.now() - t0,
            id:         o.id,
            side:       o.side,
            status:     o.status,
            type:       o.type,
            price:      o.args.price
        };

        fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    return {};

}


// init


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

process.stdin.on(
    'keypress', 
    (str, key) => { 

        let name = key["name"];
        LAST_STR = str;
        LAST_KEY = JSON.stringify(key); 
                
        if (name in IN_MAP) IN_MAP[name](str, key);
        
    }
);


IN_MAP["q"]         = quit;

const FMT           = "yyyy-MM-dd'T'HH:mm:ss.SSS";
const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const CONID         = parseInt(process.argv[2]);
const TICK_SIZE     = parseFloat(process.argv[3]);
const MIN_OFFSET    = parseInt(process.argv[4]) * TICK_SIZE;
const MAX_OFFSET    = parseInt(process.argv[5]) * TICK_SIZE;
const LAG           = parseInt(process.argv[6]);
const COL_WIDTH     = 15;
const LOGGING       = true;
const LOG_FILE      = `./logs/${format(new Date(), 'yyyy-MM-dd')}_log.txt`;
const LOG_FLAG      = { flag: "a+" };
const LOG_ERR       = (err) => {};
const ORDERS        = {}; 

let HEARTBEAT       = 0;
let POSITION        = 0;
let LAGGED          = false;
let L1_BID_PX       = null;
let L1_ASK_PX       = null;

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();


setInterval(
    async () => { 

        HEARTBEAT += 1;

        if (HEARTBEAT > 10 && !LAGGED) {
        
            LAGGED = true;

            let log_msg = {
                ts:     `${format(Date.now(), FMT)}`,
                lvl:    "INFO",
                fn:     "setInterval",
                msg:    "hb late"
            }

            fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, { flag: "a+" }, LOG_ERR);

            await clear_quote();

        } else if (HEARTBEAT <= 10 && LAGGED) {

            LAGGED = false;

            let log_msg = {
                ts:     `${format(Date.now(), FMT)}`,
                lvl:    "INFO",
                fn:     "setInterval",
                msg:    "hb ok"
            }

            fs.writeFile(LOG_FILE, `${JSON.stringify(log_msg)}\n`, { flag: "a+" }, LOG_ERR);

        }

        if (Object.keys(ORDERS).length == 0 && !LAGGED)

            await init_quote();

        update_screen();

    },
    1000
);

setInterval(
    async () => { await CLIENT.tickle(); },
    59000
);