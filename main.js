const { base_client, mdf }  = require("./ibkr/base_client");
const readline              = require("readline");
const IN_MAP                = {};


// https://ibkrcampus.com/ibkr-api-page/webapi-ref/#place-order
// node main.js 637533450 0.25 4


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);


// debug

let LAST_KEY    = null;
let LAST_STR    = null;


// screen

let STATE_LINE  = 5;
let MSG_LINE    = 10;

function update_screen(msg = null) {
    
    process.stdout.cursorTo(0, STATE_LINE);

    process.stdout.clearLine(0);
    process.stdout.write(`last key: ${LAST_STR}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`last_evt: ${LAST_KEY}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`market: ${String(L1_BID_PX).padStart(10)}${String(MID_PX).padStart(10)}${String(L1_ASK_PX).padStart(10)}${String(INSIDE_MKT).padStart(10)}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`quote:  ${String(BID_PX).padStart(10)}${String(MID_PX + OFFSET).padStart(10)}${String(ASK_PX).padStart(10)}${String((ASK_PX - BID_PX) / TICK_SIZE).padStart(10)}${String(OFFSET).padStart(10)}\n`);

    if (msg) {

        for (let i = MSG_LINE; i < process.stdout.rows; i++) {

            process.stdout.cursorTo(0, i);
            process.stdout.clearLine(0);
        
        }

        process.stdout.cursorTo(0, MSG_LINE);
        process.stdout.write(msg);

    }

}


// quote

function update_quote() {

    BID_PX = MID_PX - WIDTH + OFFSET;
    ASK_PX = MID_PX + WIDTH + OFFSET;

    if (BID_STATUS == "Active") modify_order("BUY", BID_PX);
    if (ASK_STATUS == "Active") modify_order("SELL", ASK_PX); 

    update_screen();

}


// input handlers

function inc_spread(str, key)   { 

    WIDTH += !key.shift ? TICK_SIZE : SHIFT;

    update_quote();

}

function dec_spread(str, key)   { 

    WIDTH -= !key.shift ? TICK_SIZE : SHIFT;

    update_quote();

}

function inc_offset(str, key)   { 

    OFFSET += !key.shift ? TICK_SIZE : SHIFT;

    update_quote();

}

function dec_offset(str, key)   { 

    OFFSET -= !key.shift ? TICK_SIZE : SHIFT;

    update_quote();

}

function toggle_bid(str, key)   { 

    if (!BID_STATUS) {
        
        place_order("BUY", BID_PX);

    } else {

        cancel_order(BID_ARGS.order_id);

    }

}

function toggle_ask(str, key)   { 

    if (!ASK_STATUS) {
        
        place_order("SELL", ASK_PX);

    } else {

        cancel_order(ASK_ARGS.order_id);

    }

}

function quit(str, key) { 

    if (BID_STATUS) cancel_order(BID_ARGS.order_id);
    if (ASK_STATUS) cancel_order(ASK_ARGS.order_id);

    process.exit(); 

}

IN_MAP["a"] = inc_spread;
IN_MAP["z"] = dec_spread;
IN_MAP["s"] = inc_offset;
IN_MAP["x"] = dec_offset;
IN_MAP["d"] = toggle_ask;
IN_MAP["c"] = toggle_bid;
IN_MAP["q"] = quit;

process.stdin.on(
    'keypress', 
    (str, key) => { 

        let name = key["name"];
        LAST_STR = str;
        LAST_KEY = JSON.stringify(key); 
                
        if (name in IN_MAP)
            
            IN_MAP[name](str, key);

        else

            update_screen();
        
    }
);


// orders

function place_order(side, price) {

    let args = {
        orders: [
            {
                acctId:     ACCOUNT_ID,
                conid:      CONID,
                secType:    "FUT",
                parentId:   null,
                orderType:  "LMT",
                outsideRTH: true,
                price:      price,
                side:       side,
                tif:        "GTC",
                quantity:   1
            }
        ]
    };

    let res = CLIENT.place_order(ACCOUNT_ID, args);

    if (res) {

        let order   = res[0];
        let msg     = null;

        if (order.message) {

             msg = order.message;

        } else if (side == "BUY") {

            BID_ARGS.order_id   = order.order_id;
            BID_STATUS          = order.order_status;

        } else {

            ASK_ARGS.order_id   = order.order_id;
            ASK_STATUS          = order.order_status;

        }

        update_screen(msg);

    }

}

function cancel_order(order_id) {

    let res = CLIENT.cancel_order(ACCOUNT_ID, order_id);
    let msg = null;

    if (res)

        msg = res.msg ? res.msg : res.error ? res.error : `cancel_order(${order_id}) response format not recognized`;

    else

        msg = `cancel_order(${order_id}) failed with ${res.status}`;

    update_screen(msg);

    

}

function modify_order(side, price) {

    let args    = side == "buy" ? BID_ARGS : ASK_ARGS;
    
    args.price  = price;
    
    let res     = CLIENT.modify_order(ACCOUNT_ID, order_id, args);
    let msg     = null;

    if (res)

        msg = res.msg ? res.msg : res.error ? res.error : `modify_order(${order_id} response format not recognized)`;

    else

        msg = `modify_order(${order_id}) failed with ${res.status}`;
    
    update_screen(msg);

}


// websocket handler

function ws_handler(evt) {

    if (evt.data) {

        let msg = JSON.parse(evt.data);

        if (msg[mdf.bid]) L1_BID_PX = parseFloat(msg[mdf.bid]);
        if (msg[mdf.ask]) L1_ASK_PX = parseFloat(msg[mdf.ask]);

        INSIDE_MKT  = (L1_ASK_PX - L1_BID_PX) / TICK_SIZE;
        MID_PX      = L1_BID_PX + Math.ceil(INSIDE_MKT / 2) * TICK_SIZE;

        update_screen();

    }

}

// init

const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const CONID         = parseInt(process.argv[2]);
const TICK_SIZE     = parseFloat(process.argv[3]);
const SHIFT         = parseInt(process.argv[4]) * TICK_SIZE;

let BID_STATUS      = null;
let ASK_STATUS      = null;

let BID_ARGS        = {
                        acctId:     ACCOUNT_ID,
                        conid:      CONID,
                        secType:    "FUT",
                        parentId:   null,
                        orderType:  "LMT",
                        outsideRTH: true,
                        price:      price,
                        side:       side,
                        tif:        "GTC",
                        quantity:   1
                    };
let ASK_ARGS        = {
                        acctId:     ACCOUNT_ID,
                        conid:      CONID,
                        secType:    "FUT",
                        parentId:   null,
                        orderType:  "LMT",
                        outsideRTH: true,
                        price:      price,
                        side:       side,
                        tif:        "GTC",
                        quantity:   1
                }

let BID_PX          = 0;
let ASK_PX          = 0;
let WIDTH           = 0;
let OFFSET          = 0;

let MID_PX          = 0;
let L1_BID_PX       = 0;
let L1_ASK_PX       = 0;
let INSIDE_MKT      = 0;

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();

console.log(`CONID:      ${CONID}`);
console.log(`TICK_SIZE:  ${TICK_SIZE}`);
console.log(`SHIFT:      ${SHIFT}\n`);

setInterval(() => { update_quote(); }, 1000);
