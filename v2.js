const { base_client, mdf }  = require("./ibkr/base_client");
const { format }            = require("date-fns");
const readline              = require("readline");
const fs                    = require("node:fs");
const IN_MAP                = {};


// node v2.js 620731036 0.25 6 10 5 10000


// order


class order {

    constructor(id, side, type, args) {

        this.id     = id;
        this.side   = side;
        this.type   = type;
        this.status = "null";
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

    for (let [ id, o ] of Object.entries(ORDERS)) {

        let offset = o.side == "BUY" ? (L1_BID_PX - o.price) : o.price - L1_ASK_PX;
        
        offset /= TICK_SIZE;
        
        let fields = [
            o.id.padStart(COL_WIDTH),
            o.side.padStart(COL_WIDTH),
            o.type.padStart(COL_WIDTH),
            o.status.padStart(COL_WIDTH),
            String(offset).padStart(COL_WIDTH)
        ];
        
        let line = `${fields[0]}${fields[1]}${fields[2]}${fields[3]}${fields[4]}${fields[5]}\n`;

        process.stdout.write(line);

    }

}


async function update_quote(side, l1) {

    for (let [ id, o ] of Object.entries(ORDERS)) {

        if (o.side == side && o.type == "quote") {

            let level = Math.abs(o.args.price - l1);

            if (level > MAX_OFFSET || level < MIN_OFFSET) {
                
                o.args.price = side == "BUY" ? L1_BID_PX - MAX_OFFSET : L1_ASK_PX + MAX_OFFSET;

                let modify_order_res = { error: 1 };

                while (modify_order_res.error)

                    modify_order_res = await modify_order(o);

                    // anything else?

            }

        }

    }

}


async function exit(o) {

    let price           = o.side == "BUY" ? o.args.price + LIMIT : o.args.price - LIMIT;
    let side            = o.side == "BUY" ? "SELL" : "BUY";
    let place_order_res = { error: 1 };
    
    while (place_order_res.error)

        place_order_res = await place_order(side, "exit", price);

    let mkt_out = async () => {

        let oid = place_order_res.order.id;
        let o   = ORDERS[oid];

        if (o) {

            // if !o, order was filled or cancelled already

            delete o.args.price; // correct?

            o.args.type = "MKT";

            let modify_order_res = { error: 1 };

            while(modify_order_res.error)

                modify_order_res = await modify_order(o);

        }

    }

    let handle = setTimeout(mkt_out, TIMEOUT);

}


async function handle_order_msg(msg) {

    for (let args of msg.args) {

        LOGGING ? fs.writeFile(LOG_FILE, JSON.stringify(args), { flag: "a+" }, (err) => {}) : null;

        let status      = args.status;
        let order_id    = args.orderId;
        let o           = ORDERS[order_id];

        if (!o) 

            // external order
        
            return;
        
        let state = o.side == "BUY" ? STATES["BID_STATE"] : STATES["ASK_STATE"];

        if (METRICS) {

            let log_msg = {
                ts:         format(Date.now(), FMT),
                fn:         "handle_order_msg",
                status:     status,
                side:       o.side,
                o_type:     o.type,
                fill_px:    o.price    
            };

            fs.writeFile(MET_FILE,`${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

        }

        switch(status) {

            case "Filled":

                delete ORDERS[order_id];

                if (o.type == "quote") {

                    STATES[state] = "exit";

                    await exit(o);

                } else if (o.type == "exit") {

                    // requote

                    let side    = o.side == "BUY" ? "SELL" : "BUY";
                    let price   = side == "BUY" ? L1_BID_PX - MAX_OFFSET : L1_ASK_PX + MAX_OFFSET;

                    let place_order_res = { error: 1 };
                    
                    while (place_order_res.error)
                    
                        place_order_res = await place_order(o.side, "quote", l1, price);
                    
                    if (STATES[state]) // preserve any toggle from exit
                    
                        STATES[state] = "active";

                }

                break;

            case "Cancelled":

                delete ORDERS[order_id];

                // need to requote or re-exit?

                break;

            case "Submitted":

                break;

            case "PreSubmitted":

                break;

            default:

                break;

        }

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


async function toggle_quote(str, key) {

    let side    = null;
    let price   = null;
    let state   = null;

    if (key.name == "c") {

        side    = "BUY";
        price   = L1_BID_PX - MAX_OFFSET;
        state   = "BID_STATE"; 

    } else if (key.name == "d") {

        side    = "SELL";
        price   = L1_ASK_PX + MAX_OFFSET;
        state   = "ASK_STATE";

    } else return; // ???

    switch(STATES[state]) {

        case null:

            let place_order_res = await place_order(side, "quote", price);

            if (!place_order_res.error)

                STATES[state] = "active";

            break;

        case "active":

            let to_cancel = null; 

            for (let [ id, o ]  of Object.entries(ORDERS)) {

                if (o.side == side && o.type == "quote") {

                    to_cancel = o;

                    break;

                }

            }

            if (to_cancel) {

                let cancel_order_res = { error: 1 }

                while (cancel_order_res.error)

                    cancel_order_res = await cancel_order();
            
            }

            STATES[state] = null;
            
            break;

        case "exit":

            STATES[state] = null;

            break;

        default:

            break;

    }

}


async function quit() {

    for (let [ id, o ] of Object.entries(ORDERS)) {

        if (o.type == "quote") {

            let cancel_order_res = { error: 1 };

            while (cancel_order_res.error)

                cancel_order_res = await cancel_order(o);

        } else if (o.type == "exit") {

            // leave closing order?

        }

    }

    process.exit();

}


async function ack_order(place_order_res) {
    
    let t0          = Date.now();
    let res         = {};
    let message_id  = place_order_res[0].id;

    while (!res.error) {

        res = await CLIENT.reply(message_id);
            
        if (res[0]) break;

    }

    if (METRICS) {

        let log_msg = {
            ts:     format(t0, FMT),
            fn:     ack_order,
            ms:     Date.now() - t0
        };

        fs.writeFile(MET_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    return res;

}


async function place_order(
    side,
    type,
    price
) {

    let t0      = Date.now();
    let args    = {
        orders: [
            {
                acctId:     ACCOUNT_ID,
                conid:      CONID,
                orderType:  "LMT",
                price:      price,
                side:       side,
                tif:        "GTC",
                quantity:   1
            }
        ]
    };

    let place_order_res = await CLIENT.place_order(ACCOUNT_ID, args);

    if (place_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,place_order,${place_order_res.error}\n`, { flag: "a+" }, (err) => {})

        return place_order_res;

    }

    let ack_bracket_order_res = await ack_order(place_order_res);

    if (ack_bracket_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,reply,${ack_bracket_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return ack_bracket_order_res;
    
    }

    let id      = ack_bracket_order_res[0].order_id;
    let o       = new order(id, side, type, args.orders[0]);
    ORDERS[id]  = o;

    if (METRICS) {

        let log_msg = {
            ts:     format(t0, FMT),
            fn:     "place_order",
            id:     o.id,
            side:   o.side,
            type:   o.type,
            price:  o.price,
            ms:     Date.now() - t0
        };

        fs.writeFile(MET_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }


    return { order: o };

}


async function modify_order(o) {

    let t0                  = Date.now();
    let modify_order_res    = await CLIENT.modify_order(ACCOUNT_ID, o.id, o.args);

    if (modify_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,modfiy_order,${modify_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return modify_order_res;

    }

    if (METRICS) {

        let log_msg = {
            ts:     format(t0, FMT),
            fn:     "modify_order",
            id:     o.id,
            side:   o.side,
            type:   o.type,
            price:  o.price,
            ms:     Date.now() - t0
        };

        fs.writeFile(MET_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

    }

    return {};

}


async function cancel_order(o) {

    let t0                  = Date.now();
    let cancel_order_res    = await CLIENT.cancel_order(ACCOUNT_ID, o.id);

    if (cancel_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,cancel_order,${cancel_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return cancel_order_res;

    }

    if (METRICS) {

        let log_msg = {
            ts:     format(t0, FMT),
            fn:     "cancel_order",
            id:     o.id,
            side:   o.side,
            type:   o.type,
            price:  o.price,
            ms: Date.now() - t0
        };

        fs.writeFile(MET_FILE, `${JSON.stringify(log_msg)}\n`, LOG_FLAG, LOG_ERR);

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

IN_MAP["d"]         = toggle_quote;
IN_MAP["c"]         = toggle_quote;
IN_MAP["q"]         = quit;

const FMT           = "yyyy-MM-dd'T'HH:mm:ss.T";
const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const CONID         = parseInt(process.argv[2]);
const TICK_SIZE     = parseFloat(process.argv[3]);
const MIN_OFFSET    = parseInt(process.argv[4]) * TICK_SIZE;
const MAX_OFFSET    = parseInt(process.argv[5]) * TICK_SIZE;
const LIMIT         = parseInt(process.argv[6]) * TICK_SIZE;
const TIMEOUT       = parseInt(process.argv[7]);
const COL_WIDTH     = 15;
const LOGGING       = false;
const METRICS       = true;
const LOG_FLAG      = { flag: "a+" };
const LOG_ERR       = (err) => {};
const LOG_FILE      = "./log.txt";
const MET_FILE      = "./metrics.csv";
const STATES        = { "BID_STATE": null, "ASK_STATE": null };
const ORDERS        = {};          

let HEARTBEAT       = 0;
let L1_BID_PX       = null;
let L1_ASK_PX       = null;

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();

setInterval(
    () => { 

        HEARTBEAT += 1;

        if (HEARTBEAT > 11) 
        
            quit();

        update_screen();

    },
    1000
);