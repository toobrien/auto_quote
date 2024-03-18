const base_client   = require("./ibkr/base_client");
const readline      = require("readline");
const IN_MAP        = {};


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
const TICK      = parseFloat(process.argv[3]);
const SHIFT     = parseInt(process.argv[4]) * TICK;

console.log(`CONID: ${CONID}`);
console.log(`TICK:  ${TICK}`);
console.log(`SHIFT: ${SHIFT}`);

setInterval(() => { return; }, 1000);
