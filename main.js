const { base_client, mdf }  = require("./ibkr/base_client");
const readline              = require("readline");
const IN_MAP                = {};


// node main.js 637533450 0.25 4


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);


// debug

let LAST_KEY    = null;
let LAST_STR    = null;


// screen

let COL_WIDTH   = 15
let STATE_LINE  = 5;
let MSG_LINE    = 13;
let TITLE_LINE  = `${"".padStart(COL_WIDTH)}${"bid".padStart(COL_WIDTH)}${"mid".padStart(COL_WIDTH)}${"ask".padStart(COL_WIDTH)}${"width".padStart(COL_WIDTH)}${"offset".padStart(COL_WIDTH)}\n`

function update_screen(msg = null) {
    
    process.stdout.cursorTo(0, STATE_LINE);

    let lines = [
        `heartbeat:  ${String(HEARTBEAT).padStart(COL_WIDTH)}\n`,
        `bid status: ${String(BID_ARGS.order_id).padStart(COL_WIDTH)}${String(BID_STATUS).padStart(COL_WIDTH)}\n`,
        `ask status: ${String(ASK_ARGS.order_id).padStart(COL_WIDTH)}${String(ASK_STATUS).padStart(COL_WIDTH)}\n`,
        "\n",
        //`last key:   ${String(LAST_STR).padStart(COL_WIDTH)}\n`,
        //`last_evt:   ${String(LAST_KEY).padStart(COL_WIDTH)}\n`,
        TITLE_LINE,
        `market:     ${String(L1_BID_PX).padStart(COL_WIDTH)}${String(MID_PX).padStart(COL_WIDTH)}${String(L1_ASK_PX).padStart(COL_WIDTH)}${String(INSIDE_MKT).padStart(COL_WIDTH)}\n`,
        `quote:      ${String(BID_PX).padStart(COL_WIDTH)}${String(MID_PX + OFFSET).padStart(COL_WIDTH)}${String(ASK_PX).padStart(COL_WIDTH)}${String((ASK_PX - BID_PX) / TICK_SIZE).padStart(COL_WIDTH)}${String(OFFSET / TICK_SIZE).padStart(COL_WIDTH)}`,
    ]

    for (let line of lines) {

        process.stdout.clearLine(0);
        process.stdout.write(line);

    }

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

MOD_STATES = [
    "PreSubmitted",
    "Submitted"
]

function update_quote() {

    BID_PX = MID_PX - WIDTH + OFFSET;
    ASK_PX = MID_PX + WIDTH + OFFSET;

    if (MOD_STATES.includes(BID_STATUS)) modify_order(BID_ARGS.order_id, "BUY", BID_PX);
    if (MOD_STATES.includes(ASK_STATUS)) modify_order(ASK_ARGS.order_id, "SELL", ASK_PX); 

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

    if (!BID_STATUS)    place_order("BUY", BID_PX);
    else                cancel_order(BID_ARGS.order_id);

}

function toggle_ask(str, key)   { 

    if (!ASK_STATUS)    place_order("SELL", ASK_PX);
    else                cancel_order(ASK_ARGS.order_id);

}

function quit(str, key) { 

    cancel_order(BID_ARGS.order_id);
    cancel_order(ASK_ARGS.order_id);

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

async function place_order(side, price) {

    if (
        (side == "BUY"  && BID_STATUS) ||
        (side == "SELL" && ASK_STATUS)
    )
        
        return;

    let args = {
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

    let res     = await CLIENT.place_order(ACCOUNT_ID, args);
    let order   = null;

    while (!res.error) {

        res = await CLIENT.reply(res[0].id);
            
        if (!res.error && res[0].order_status) {

            order = res[0];

            break;

        }

    }

    if (order) {

        if (side == "BUY") {

            BID_ARGS.order_id   = res[0].order_id;
            BID_STATUS          = res[0].order_status;

        } else {

            ASK_ARGS.order_id   = res[0].order_id;
            ASK_STATUS          = res[0].order_status;

        }

        update_screen(res.error ? res.error : "");

    }

}

async function cancel_order(order_id) {

    if (!order_id) return;

    let res = await CLIENT.cancel_order(ACCOUNT_ID, order_id);
    let msg = res.msg ? res.msg : res.error ? res.error : `cancel_order(${order_id}) response format not recognized`;

    update_screen(msg);

}

async function modify_order(order_id, side, price) {

    if (!order_id) return;

    let args    = side == "BUY" ? BID_ARGS : ASK_ARGS;

    args.price  = price;
    
    let res     = (await CLIENT.modify_order(ACCOUNT_ID, order_id, args))[0];
    let msg     = res.order_status ? res.order_status : res.error ? res.error : `modify_order(${order_id} response format not recognized)`;

    update_screen(msg);

}


// message handling

function handle_market_data_msg(msg) {

    if (msg[mdf.bid]) L1_BID_PX = parseFloat(msg[mdf.bid]);
    if (msg[mdf.ask]) L1_ASK_PX = parseFloat(msg[mdf.ask]);

    INSIDE_MKT  = (L1_ASK_PX - L1_BID_PX) / TICK_SIZE;
    MID_PX      = L1_BID_PX + Math.ceil(INSIDE_MKT / 2) * TICK_SIZE;

}

function handle_system_msg(msg) {

    let hb = msg.hb

    if (hb) {

        HEARTBEAT = 0;

        update_screen()

    }

}

function handle_order_msg(msg) {

    for (let order of msg.args) {

        let conid   = order.conid;
        let status  = order.status;
        let side    = order.side;
        // let r_qty   = order.remainingQuantity;
        // let f_qty   = order.filledQuantity;

        if (conid != CONID) return;
        
        if (side == "BUY") {

            if (status == "Cancelled" || status == "Filled") {

                BID_STATUS          = null;
                BID_ARGS.order_id   = null;
            
            } else {

                BID_STATUS = status;

            }

        } else if (side == "SELL") {

            if (status == "Cancelled" || status == "Filled") {

                ASK_STATUS          = null;
                ASK_ARGS.order_id   = null;

            } else {

                ASK_STATUS = status;

            }

        }
        
    }

}

function ws_handler(evt) {

    if (!evt.data) return;
    

    let msg = JSON.parse(evt.data);

    switch(msg.topic) {

        case `smd+${CONID}`:

            handle_market_data_msg(msg);

            break;
        
        case "system":

            handle_system_msg(msg);

            break;

        case "sor":

            handle_order_msg(msg);

            break;

        default:

            break;

    }
    
    update_screen();

    // console.log(JSON.stringify(msg, null, 2));

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
                        orderType:  "LMT",
                        price:      null,
                        side:       "BUY",
                        tif:        "GTC",
                        quantity:   1
                    };
let ASK_ARGS        = {
                        acctId:     ACCOUNT_ID,
                        conid:      CONID,
                        orderType:  "LMT",
                        price:      null,
                        side:       "SELL",
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

let HEARTBEAT       = 0;

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();

console.log(`CONID:      ${String(CONID).padStart(COL_WIDTH)}`);
console.log(`TICK_SIZE:  ${String(TICK_SIZE).padStart(COL_WIDTH)}`);
console.log(`SHIFT:      ${String(SHIFT).padStart(COL_WIDTH)}\n`);


setInterval(
    () => { 

        HEARTBEAT += 1;

        if (HEARTBEAT > 11) {

            if (BID_STATUS) cancel_order(BID_ARGS.order_id);
            if (ASK_STATUS) cancel_order(ASK_ARGS.order_id);

        }

        update_quote();

    },
    1000
);