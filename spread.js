const { base_client, mdf }  = require("./ibkr/base_client");
const { format }            = require("date-fns");


// node spread.js 637533398 637533595


async function ack_order(place_order_res) {
    
    let message_id  = place_order_res[0].id;
    let res         = await CLIENT.reply(message_id);

    return res;

}


async function place_order(conid, side) {

    let args = {
                orders: [
                    {
                        acctId:     ACCOUNT_ID,
                        conid:      conid,
                        side:       side,
                        tif:        "GTC",
                        quantity:   1,
                        orderType:  "MKT"
                    }
                ]
            };
    
    let res = CLIENT.place_order(ACCOUNT_ID, args);

    return res;

}


async function handler(evt) {

    if (!evt.data) 
        
        return;
    
    let msg = JSON.parse(evt.data);

    if (msg.hb | msg.topic != "sor") {

        HEARTBEAT = 0;
        
        return;

    }

    console.log(JSON.stringify(msg));

    for (let args of msg.args) {
    
        if (args.status != "Filled")

            continue;

        let conid   = args.conid;
        let i       = LEGS.indexOf(conid);

        if (i == -1 | LOCK)

            continue;
        
        LOCK = true;

        let spread_leg_id   = i == 1 ? LEGS[0] : LEGS[1];
        let fill_side       = args.orderDesc.includes("Bought") ? "BUY" : "SELL";
        let side            = args.orderDesc.includes("Bought") ? "SELL" : "BUY";

        console.log(`${Date.now(), FMT},INFO,handler,${conid} ${fill_side} fill; executing ${spread_leg_id} MKT ${side}`);

        let place_order_res = await place_order(spread_leg_id, side);

        if (place_order_res.error) {

            console.log(`${Date.now(), FMT},ERROR,place_order,${JSON.stringify(place_order_res)}`);
            console.log(`${Date.now(), FMT},INFO,exit`);

            process.exit();

        }

        let ack_order_res   = await ack_order(place_order_res);

        if (ack_order_res.error) {

            console.log(`${Date.now(), FMT},ERROR,ack_order,${JSON.stringify(place_order_res)}`);
            console.log(`${Date.now(), FMT},INFO,exit`);

            process.exit();

        }

        LOCK = false;

    }
    

}


function hb_check() {

    if (HEARTBEAT > 10) {

        console.log(`${format(Date.now(), FMT)},INFO,hb late`);
        console.log(`${Date.now(), FMT},INFO,exit`);

        process.exit();

    }

}

async function ping() {

    let tickle_res = CLIENT.tickle();

    if (tickle_res.error) {

        console.log(`${format(Date.now(), FMT)},ERROR,${tickle_res.error}`);

        process.exit();

    }

}


async function init() {

    await CLIENT.set_ws_handlers(msg_handler = handler);
    await CLIENT.sub_order_updates();

}


const   FMT         = "yyyy-MM-dd'T'HH:mm:ss.SSS";
const   ACCOUNT_ID  = process.env.IBKR_ACCOUNT_ID;
const   LEGS        = [ 
                        parseInt(process.argv[2]), 
                        parseInt(process.argv[3]) 
                    ];
const   HOSTNAME    = process.argv[4];
const   CLIENT      = new base_client(HOSTNAME);
let     LOCK        = false;
let     HEARTBEAT   = 0;


init();
setInterval(hb_check, 1000);
setInterval(ping, 60000);