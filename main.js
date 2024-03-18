const { base_client, mdf }  = require("./ibkr/base_client");
const readline              = require("readline");
const IN_MAP                = {};


// https://ibkrcampus.com/ibkr-api-page/webapi-ref/#place-order

// node main.js 637533450 0.25 4


readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

function inc_spread(str, key)   { console.log(str); console.log(key);}
function dec_spread(str, key)   { console.log(str); console.log(key);}
function inc_offset(str, key)   { console.log(str); console.log(key);}
function dec_offset(str, key)   { console.log(str); console.log(key);}
function toggle_bid(str, key)   { console.log(str); console.log(key); }
function toggle_ask(str, key)   { console.log(str); console.log(key); }
function quit(str, key)         { console.log(str); console.log(key); process.exit(); }

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
        
        if (name in IN_MAP)
            
            IN_MAP[name](str, key); 
        
    }
);

const CLIENT    = new base_client();
const CONID     = parseInt(process.argv[2]);
const TICK_SIZE = parseFloat(process.argv[3]);
const SHIFT     = parseInt(process.argv[4]) * TICK_SIZE;

let BID_ID      = null;
let ASK_ID      = null;
let BID_PX      = 0;
let ASK_PX      = 0;
let WIDTH       = 0;
let OFFSET      = 0;

let MID_PX      = 0;
let L1_BID_PX   = 0;
let L1_ASK_PX   = 0;
let INSIDE_MKT  = 0;

CLIENT.set_ws_handlers(
    msg_handler = (evt) => {

        if (evt.data) {

            let msg = JSON.parse(evt.datqcqa);

            //console.log(msg);

            if (msg[mdf.bid]) L1_BID_PX = parseFloat(msg[mdf.bid]);
            if (msg[mdf.ask]) L1_ASK_PX = parseFloat(msg[mdf.ask]);

            INSIDE_MKT  = (L1_ASK_PX - L1_BID_PX) / TICK_SIZE;
            MID_PX      = L1_BID_PX + Math.ceil(ticks / 2) * TICK_SIZE;

            console.log(`${String(L1_BID_PX).padStart(10)}\t${String(MID_PX).padStart(10)}\t${String(L1_ASK_PX).padStart(10)}${String(INSIDE_MKT).padStart(10)}`);

        }

    }
);

CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);

console.log(`CONID:      ${CONID}`);
console.log(`TICK_SIZE:  ${TICK_SIZE}`);
console.log(`SHIFT:      ${SHIFT}`);

setInterval(() => { return; }, 1000);
