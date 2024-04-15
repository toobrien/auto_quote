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
    
    update_screen();

}


async function offer() {}
async function bid() {}
async function place_order() {}
async function modify_order() {}
async function cancel_order() {}
async function update_quote() {}
async function quit() {}
function update_screen() {}


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
let HEARTBEAT       = 0;

CLIENT.set_ws_handlers(msg_handler = ws_handler);
CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);
CLIENT.sub_order_updates();