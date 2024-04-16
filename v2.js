const { base_client, mdf }  = require("./ibkr/base_client");
const readline              = require("readline");
const fs                    = require("node:fs");
const IN_MAP                = {};


// node v1.js 637533450 0.25 6 9 5


// functions


function handle_order_msg(msg) {}
function handle_system_msg(msg) {}
function handle_market_data_msg(msg) {}


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

}


function update_screen() {}


async function offer() {}
async function bid() {}


async function ack_bracket_order(place_order_res) {

    let res         = {};
    let message_id  = place_order_res[0].id;

    while (!res.error) {

        res = await CLIENT.reply(message_id);
            
        if (res[0]) break;

    }

    return res;

}


async function place_bracket_orders(
    parent_side,
    parent_price,
    child_price
) {


    let bracket     = parent_side == "BUY" ? BID_BRACKET : ASK_BRACKET;
    let parent_id   = Date.now();
    let child_side  = parent_side == "BUY" ? "SELL" : "BUY";

    let args    = {
        orders: [
            {
                acctId:     ACCOUNT_ID,
                conid:      CONID,
                cOID:       parent_id,
                orderType:  "LMT",
                price:      parent_price,
                side:       parent_side,
                tif:        "GTC",
                quantity:   1
            },
            {
                acctId:     ACCOUNT_ID,
                conid:      CONID,
                parentId:   parent_id,
                orderType:  "LMT",
                price:      child_price,
                side:       child_side,
                tif:        "GTC",
                quantity:   1
            }
        ]
    };

    let place_order_res = await CLIENT.place_order(ACCOUNT_ID, args);

    if (place_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},base_client.place_order,${place_order_res.error}\n`, { flag: "a+" }, (err) => {})

        return place_order_res;

    }

    let ack_bracket_order_res = await ack_bracket_order(place_order_res);

    if (ack_bracket_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},base_client.reply,${ack_bracket_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return ack_bracket_order_res;
    
    }

    bracket.args            = args;
    bracket.parent_id       = ack_bracket_order_res[0].order_id;
    bracket.parent_status   = ack_bracket_order_res[0].order_status;

    return {};

}


async function modify_bracket_order(parent_id, side, parent_px, child_px) {

    let bracket = side == "BUY" ? BID_BRACKET : ASK_BRACKET;
    let args    = bracket.args;

    args.orders[0].price = parent_px;
    args.orders[1].price = child_px;

    let modify_order_res = await CLIENT.modify_order(ACCOUNT_ID, parent_id, args);

    if (modify_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},base_client.modfiy_order,${modify_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return modify_order_res;

    }

    return {};

}

async function cancel_bracket_order() {}
async function update_quote() {}
async function quit() {}


// init


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

IN_MAP["d"] = offer();
IN_MAP["c"] = bid();
IN_MAP["q"] = quit();

const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const CONID         = parseInt(process.argv[2]);
const TICK_SIZE     = parseFloat(process.argv[3]);
const MIN_LEVEL     = parseInt(process.argv[4]) * TICK_SIZE;
const MAX_LEVEL     = parseInt(process.argv[5]) * TICK_SIZE;
const LIMIT         = parseInt(process.argv[6]) * TICK_SIZE;

let OFFERING        = false;
let BIDDING         = false;
let BID_BRACKET     = {};
let ASK_BRACKET     = {};

let HEARTBEAT       = 0;
let L1_BID_PX       = null;
let L1_ASK_PX       = null;
let BID_PX          = null;
let ASK_PX          = null;

let LOG_FILE        = "./log.txt";
let MET_FILE        = "./metrics.csv";

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();

setInterval(
    () => { 

        HEARTBEAT += 1;

        if (HEARTBEAT > 11) {

            //

        }

    },
    1000
);


// test

setTimeout(
    async () => {

        let res = await place_bracket_orders("BUY", 5000, 5001.25);

        if (!res.error)
        
            res = await modify_bracket_order(BID_BRACKET.parent_id, "BUY", 5001, 50002.25);
        
        0;

    },
    0
);