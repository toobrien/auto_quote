const { base_client, mdf }  = require("./ibkr/base_client");


async function handler(evt) {

    if (!evt.data) 
        
        return;
    
    let msg = JSON.parse(evt.data);

    if (msg.topic != "sor")
        
        return;

    for (let args of msg.args) {
    
        if (args.status != "Filled")

            continue;

        let order_id    = args.orderId;
        let conid       = args.conid;
        let i           = LEGS.indexOf(conid);

        if (i == -1)

            continue;

        let spread_leg  = i == 1 ? LEGS[0] : LEGS[1];
        let qty         = args.totalSize;

    }
    

}


async function init() {

    await CLIENT.set_ws_handlers(msg_handler = handler);
    await CLIENT.sub_order_updates();

}





const ACCOUNT_ID    = process.env.IBKR_ACCOUNT_ID;
const CLIENT        = new base_client();
const LEGS          = [ 
                        parseInt(process.argv[2]), 
                        parseInt(process.argv[3]) 
                    ];

init();