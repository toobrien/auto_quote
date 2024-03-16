const base_client = require("./ibkr/base_client");

const client = new base_client();

setInterval(() => { console.log("hello, world"); }, 1000);