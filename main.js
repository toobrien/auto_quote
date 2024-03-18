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

function update_screen() {
    
    process.stdout.cursorTo(0, 5);

    process.stdout.clearLine(0);
    process.stdout.write(`last key: ${LAST_STR}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`last_evt: ${LAST_KEY}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`market: ${String(L1_BID_PX).padStart(10)}${String(MID_PX).padStart(10)}${String(L1_ASK_PX).padStart(10)}${String(INSIDE_MKT).padStart(10)}\n`);
    process.stdout.clearLine(0);
    process.stdout.write(`quote:  ${String(BID_PX).padStart(10)}${String(MID_PX + OFFSET).padStart(10)}${String(ASK_PX).padStart(10)}${String((ASK_PX - BID_PX) / TICK_SIZE).padStart(10)}${String(OFFSET).padStart(10)}\n`);

}


function update_quote() {

    BID_PX = MID_PX - WIDTH + OFFSET;
    ASK_PX = MID_PX + WIDTH + OFFSET;

    update_screen();

}


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

function toggle_bid(str, key)   { update_quote(); }
function toggle_ask(str, key)   { update_quote(); }
function quit(str, key)         { process.exit(); }

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

            let msg = JSON.parse(evt.data);

            //console.log(msg);

            if (msg[mdf.bid]) L1_BID_PX = parseFloat(msg[mdf.bid]);
            if (msg[mdf.ask]) L1_ASK_PX = parseFloat(msg[mdf.ask]);

            INSIDE_MKT  = (L1_ASK_PX - L1_BID_PX) / TICK_SIZE;
            MID_PX      = L1_BID_PX + Math.ceil(INSIDE_MKT / 2) * TICK_SIZE;

            update_screen();

        }

    }
);

CLIENT.sub_market_data([ CONID ], [ mdf.bid, mdf.ask ]);

console.log(`CONID:      ${CONID}`);
console.log(`TICK_SIZE:  ${TICK_SIZE}`);
console.log(`SHIFT:      ${SHIFT}\n`);

setInterval(() => { update_quote(); }, 1000);
