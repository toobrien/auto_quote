const { base_client, mdf }  = require("./ibkr/base_client");



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
    
    let res = CLIENT.place_order(ACCOUNT_ID, args)

    return res;

}


async function handler(evt) {

    if (!evt.data) 
        
        return;
    
    let msg = JSON.parse(evt.data);

    if (msg.topic != "sor")
        
        return;

    for (let args of msg.args) {
    
        if (args.status != "Filled")

            continue;

        let conid       = args.conid;
        let i           = LEGS.indexOf(conid);

        if (i == -1 | LOCK)

            continue;
        
        LOCK = true;

        let spread_leg_id   = i == 1 ? LEGS[0] : LEGS[1];
        let side            = args.orderDesc.includes("Bought") ? "SELL" : "BUY";
        let place_order_res = await place_order(spread_leg_id, side);

        if (place_order_res.error)

            console.log(JSON.stringify(place_order_res));

        let ack_order_res   = await ack_order(place_order_res);

        if (ack_order_res.error)

            console.log(JSON.stringify(ack_order_res));

        LOCK = false;

    }
    

}


async function init() {

    await CLIENT.set_ws_handlers(msg_handler = handler);
    await CLIENT.sub_order_updates();

}





const   ACCOUNT_ID  = process.env.IBKR_ACCOUNT_ID;
const   CLIENT      = new base_client();
const   LEGS        = [ 
                        parseInt(process.argv[2]), 
                        parseInt(process.argv[3]) 
                    ];
let     LOCK        = false;

init();