const { base_client, mdf }  = require("./ibkr/base_client");
const { format }            = require("date-fns");
const readline              = require("readline");
const fs                    = require("node:fs");
const IN_MAP                = {};


// node v1.js 637533450 0.25 6 9 5


// order

class order {

    constructor(id, side, type, args) {

        this.id     = id;
        this.side   = side;
        this.type   = type;
        this.args   = args;

    }

}


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


async function ack_order(place_order_res) {
    
    let t0          = Date.now();
    let res         = {};
    let message_id  = place_order_res[0].id;

    while (!res.error) {

        res = await CLIENT.reply(message_id);
            
        if (res[0]) break;

    }

    METRICS ? fs.writeFile(MET_FILE, `${format(t0, FMT)},ack_order,${Date.now() - t0}\n`, { flag: "a+" }, (err) => {}) : null;

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

    let id  = ack_bracket_order_res[0].order_id;
    let o   = new order(id, side, type, args.orders[0]);

    ORDERS[id] = o;

    METRICS ? fs.writeFile(MET_FILE, `${format(t0, FMT)},place_order,${Date.now() - t0}\n`, { flag: "a+" }, (err) => {}) : null;

    return { order: o };

}


async function modify_order(o) {

    let t0                  = Date.now();
    let modify_order_res    = await CLIENT.modify_order(ACCOUNT_ID, o.id, o.args);

    if (modify_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,modfiy_order,${modify_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return modify_order_res;

    }

    METRICS ? fs.writeFile(MET_FILE, `${format(t0, FMT)},modify_order,${Date.now() - t0}\n`, { flag: "a+" }, (err) => {}) : null;

    return {};

}


async function cancel_order(o) {

    let t0                  = Date.now();
    let cancel_order_res    = await CLIENT.cancel_order(ACCOUNT_ID, o.id);

    if (cancel_order_res.error) {

        fs.writeFile(LOG_FILE, `${Date.now()},ERROR,cancel_order,${cancel_order_res.error}\n`, { flag: "a+" }, (err) => {});

        return cancel_order_res;

    }

    METRICS ? fs.writeFile(MET_FILE, `${format(t0, FMT)},cancel_order,${Date.now() - t0}\n`, { flag: "a+" }, (err) => {}) : null;

    return {};

}


async function update_quote() {}
async function quit() {}


// init


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

IN_MAP["d"] = offer();
IN_MAP["c"] = bid();
IN_MAP["q"] = quit();

const FMT           = "yyyy-MM-dd'T'HH:mm:ss.T";

const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const CONID         = parseInt(process.argv[2]);
const TICK_SIZE     = parseFloat(process.argv[3]);
const MIN_LEVEL     = parseInt(process.argv[4]) * TICK_SIZE;
const MAX_LEVEL     = parseInt(process.argv[5]) * TICK_SIZE;
const LIMIT         = parseInt(process.argv[6]) * TICK_SIZE;

let OFFER_STATE     = null;
let BID_STATE       = null;
let ORDERS          = {};          

let HEARTBEAT       = 0;
let L1_BID_PX       = null;
let L1_ASK_PX       = null;
let BID_PX          = null;
let ASK_PX          = null;

let LOGGING         = false;
let METRICS         = true;
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

        let o                   = null;
        let modify_order_res    = null;
        let cancel_order_res    = null;
        let place_order_res     = await place_order("BUY", "bid_quote", 5000);

        if (!place_order_res.error) {

            o                   = place_order_res.order;
            o.args.price        = 5001;
            modify_order_res    = await modify_order(o);

        }

        if (!modify_order_res.error) {

            cancel_order_res = await cancel_order(o);

        }
        
        0;

    },
    0
);