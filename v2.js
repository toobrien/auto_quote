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

    let ack_bracket_order_res = [];

    for (let res of place_order_res) {

        while (!res.error) {

            res = await CLIENT.reply(res[0].id);
                
            if (res.error) {

                ack_bracket_order_res.push(res);

                break;
            
            } else if (res[0].order_status) {
        
                ack_bracket_order_res.push(res[0]);

                break;

            }

        }

    }

    return ack_bracket_order_res;

}


async function place_bracket_orders(
    parent_id,
    parent_side,
    parent_price,
    child_side,
    child_price,
) {

    let bracket = parent_side == "BUY" ? BID_BRACKET : ASK_BRACKET;
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

    bracket.parent_args = args.orders[0];
    bracket.child_args  = args.orders[1];  

    let place_order_res = await CLIENT.place_order(ACCOUNT_ID, args);

    if (place_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},base_client.place_order,${place_order_res.error}\n`, { flag: "a+" }, (err) => {})

        return place_order_res.error;

    }

    let ack_bracket_order_res = await ack_bracket_order(res);

    for (let res of ack_bracket_order_res) {

        if (res.error) {

            fs.writeFile(LOG_FILE, `${Date.now()},base_client.reply,${ack_bracket_order_res.error}\n`, { flag: "a+" }, (err) => {});

            return res.error;
        
        }

    }

    bracket.parent_id       = ack_bracket_order_res[0].order_id;
    bracket.parent_status   = ack_bracket_order_res[0].order_status;
    bracket.child_id        = ack_bracket_order_res[1].order_id;        // can i assume order here?
    bracket.child_status    = ack_bracket_order_res[1].order_status;    // what if one ack succeeds, but the other fails?

    return null;

}


async function modify_order() {}
async function cancel_order() {}
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