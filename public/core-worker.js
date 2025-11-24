importScripts('https://cdn.jsdelivr.net/npm/bitcoinjs-lib-browser@5.1.7/bitcoinjs.min.js');

const baseName = "appBase",
    objectStores = 
    {
        mainCount : "mainCount",
        settings : "settings",
        main : "main"
    };

var myKeyPair = {publicKey: null, privateKey: null},
    defaultWsUri = {url: "ws://" + self.location.host, channelId: ""}, 
    limit = 0, maxAge = 0, minDate = 0, dateNow = 0, websockets = [];

minDate = getDateIntByAge(maxAge);
dateNow = getDateIntByAge(0);

function logerr(err){
    console.log(err);
}

function postMessage(type, data){
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: type, data: data });
        });
    });
}

function getDateIntByAge(age){
    const today = new Date(),
        pastDate = new Date(today);
    pastDate.setDate(today.getDate() - age);
    let year = pastDate.getFullYear(), 
        month = pastDate.getMonth() + 1, 
        day = pastDate.getDate();
    return (year * 10000) + (month * 100) + day;
}

function connectDB(f){
    var request = indexedDB.open(baseName, 1);
    request.onerror = logerr;
    request.onsuccess = function(){
        f(request.result);
    }
    request.onupgradeneeded = function(e){
        const db = e.target.result,
            settings = db.createObjectStore(objectStores.settings, { keyPath: "param" }),
            main = db.createObjectStore(objectStores.main, { keyPath: "pubKey" }),
            mainCount = db.createObjectStore(objectStores.mainCount, { keyPath: "date" });

        main.createIndex("idx_date", "date", { unique: false });

        connectDB(f);
    }
}

function getRandomIntInclusive(date, f) {
    connectDB(function(db){
        const tx = db.transaction([objectStores.mainCount], "readonly");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.mainCount).get(date);
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                max = Math.floor(cursor.count);
                f(Math.floor(Math.random() * max));
            }else{
                f(0);
            }
        };
    });  
}

function getStat(f) {
    connectDB(function(db){
        const results = {date:[], count:[]};
        const tx = db.transaction([objectStores.mainCount], "readonly");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.mainCount).openCursor();
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                let dateStr = cursor.value.date.toString();
                dateStr = dateStr.slice(0, 4) + "-" + dateStr.slice(4);
                dateStr = dateStr.slice(0, 7) + "-" + dateStr.slice(7);
                results.date.push(dateStr);
                results.count.push(cursor.value.count);
                cursor.continue();
            } else {
                f(results); // No more records
            }
        };
    });
}

function findPubKey(pubKey, f){
    connectDB(function(db){
        let request = db.transaction([objectStores.main], "readonly").objectStore(objectStores.main).openCursor(pubKey);
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                f(true);
            } else {
                f(false);
            }
        };
    });
}

function getPubKeys(date, offset, limit, f){
    let skipCount = 0, retrievedCount = 0;
    const results = [];
    connectDB(function(db){
        const tx = db.transaction([objectStores.main], "readonly");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.main).index("idx_date").openCursor(date);
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (skipCount < offset) {
                    skipCount++;
                    cursor.continue();
                } else if (retrievedCount < limit) {
                    results.push(cursor.value);
                    retrievedCount++;
                    cursor.continue();
                } else {
                    f(results); // Limit reached
                }
            } else {
                f(results); // No more records
            }
        };
    });
}

function insertPubKeys(pubKeys, date){
    connectDB(function(db){
        let count = 0;
        const tx = db.transaction([objectStores.main], "readwrite");
        tx.onerror = logerr;
        pubKeys.forEach(pubKey => {
            let request = tx.objectStore(objectStores.main).openCursor(pubKey);
            request.onerror = logerr;
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor || cursor.value.date < date) {
                    let request = tx.objectStore(objectStores.main).put({ "pubKey": pubKey, "date": date });
                    request.onerror = logerr;
                    request.onsuccess = () => {
                        count++;
                    };
                }
            };
        })
        tx.oncomplete = function(event) {
            if(count > 0){
                updateCount(db, date, count);
            }
        }
    });
}

function updateCount(db, date, count){
    const tx = db.transaction([objectStores.mainCount], "readwrite");
    tx.onerror = logerr;
    let request = tx.objectStore(objectStores.mainCount).get(date);
    request.onerror = logerr;
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            count = count + cursor.count;
        }
        let request = tx.objectStore(objectStores.mainCount).put({ "date": date, "count": count });
        request.onerror = logerr;
    };
}

function deleteOldKeys(){
    connectDB(function(db){
        const tx = db.transaction([objectStores.main, objectStores.mainCount], "readwrite");
        tx.onerror = logerr;
        const keyRange = IDBKeyRange.bound(0, minDate);
        let request = tx.objectStore(objectStores.main).index("idx_date").openCursor(keyRange);
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        let requestCounts = tx.objectStore(objectStores.mainCount).openCursor(keyRange);
        requestCounts.onerror = logerr;
        requestCounts.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    });
}

function signMSG(msg){
    let hashMSG = bitcoinjs.crypto.hash256(msg); 
    let key = bitcoinjs.ECPair.fromPrivateKey(myKeyPair.privateKey);
    return key.sign(hashMSG);
}

function verifyMSG(publicKey, msg, sig){
    let hashMSG = bitcoinjs.crypto.hash256(msg);
    let key = bitcoinjs.ECPair.fromPublicKey(publicKey);
    return key.verify(hashMSG, sig);
}

/*
msg format:
From provider service:
msgType(1byte) + age(1byte) + pubKeys(array of 20byte hash - similar bitcoin adress)
From consumer service:
msgType(1byte) + age(1byte)
*/
function generateAnswer(url, msg){
    let ws = getWSByUrl(url);
    if(msg.byteLength >= 1){
        let request = [],
            age = bitcoinjs.Buffer.from(msg, 0, 1);
        if(age[0] >= 0 && age[0] <= maxAge){
            let date = getDateIntByAge(age[0]);
            if (ws.channelId === myKeyPair.publicKey){
                request.push(age);
                getRandomIntInclusive(date, function(offset){
                    getPubKeys(date, offset, limit, function(arr){
                        for (let i = 0; i < arr.length; i++) {
                            request.push(bitcoinjs.Buffer.from(arr[i]));
                        }
                        request.push(signMSG(request));
                        sendTo(url, bitcoinjs.Buffer.concat(request));
                    });
                });   
            }else{
                if(ws.lastAge === age[0] && msg.byteLength >= 85){
                    if(verifyMSG(ws.channelId, bitcoinjs.Buffer.from(msg, 0, msg.byteLength - 64), bitcoinjs.Buffer.from(msg, msg.byteLength - 64, msg.byteLength))){
                        let pubKeys = [];
                        for (let i = 0; i < limit && 1 + (i * 20) < msg.byteLength - 64; i++) {
                            pubKeys.push(bitcoinjs.Buffer.from(msg, 1 + (i * 20), 20));
                        }
                        insertPubKeys(pubKeys, date);
                        let nextAge = new Uint8Array(1);
                        nextAge.fill(ws.lastAge + 1);
                        ws.lastAge = nextAge[0];
                        sendTo(url, bitcoinjs.Buffer.from(nextAge, 0, 1));  
                    }
                }
            }
        }
    }
}

function initWS(url, msg){
    let websocket = new WebSocket(url);

    websocket.addEventListener("open", () => {
        logerr("CONNECTED");
        websockets.push({url: url, channelId: bitcoinjs.Buffer.from(msg, 'hex'), websocket: websocket, lastAge: 0});
        //set channel id
        send(websocket, msg);
    });

    websocket.addEventListener("close", () => {
        logerr("DISCONNECTED");
        websockets = websockets.filter(item => item.websocket !== websocket);
    });

    websocket.addEventListener("message", (e) => {
        logerr(`RECEIVED: ${e.data}`);
        generateAnswer(url, e.data);
    });

    websocket.addEventListener("error", (e) => {
        logerr(`ERROR: ${e.data}`);
        websockets = websockets.filter(item => item.websocket !== websocket);
    });
}

function send(websocket, msg){
    if (msg !== null){
        websocket.send(msg);
    }
}

function sendTo(url, msg){
    let item = getWSByUrl(url);
    if (item === undefined){
        initWS(url, msg);
    }else{
        send(item.websocket, msg);
    }
}

function getWSByUrl(url){
    return websockets.find(item => item.url === url);
}

function constructor(){
    getSettings(function(params){
        limit = params.limit, maxAge = params.maxAge;
        if(!params.maxAge || params.maxAge === 0){
            maxAge = 30;
            setSettings("maxAge", maxAge);
        }else{
            postMessage("SETTINGS", { param: "maxAge", value: maxAge });
        }
        if(!params.limit || params.limit === 0){
            limit = 100000;
            setSettings("limit", limit);
        }else{
            postMessage("SETTINGS", { param: "limit", value: limit });
        }
        let keyPair;
        try {
            keyPair = bitcoinjs.ECPair.fromPrivateKey(bitcoinjs.Buffer.from(params.privateKey));
            myKeyPair = {publicKey: bitcoinjs.Buffer.from(keyPair.publicKey), privateKey: bitcoinjs.Buffer.from(keyPair.privateKey)};           
            if(keyPair){
                postMessage("SETTINGS", { param: "privateKey", value: genQRString(myKeyPair.privateKey) });
            }
        }catch(error) {
            keyPair = bitcoinjs.ECPair.makeRandom();
            myKeyPair = {publicKey: bitcoinjs.Buffer.from(keyPair.publicKey), privateKey: bitcoinjs.Buffer.from(keyPair.privateKey)};
            setSettings("privateKey", myKeyPair.privateKey);
        }

        minDate = getDateIntByAge(maxAge);
        defaultWsUri.channelId = myKeyPair.publicKey.toString('hex');

        //test_load();
        deleteOldKeys();
        getStat(function(res){
            postMessage("NETSTAT", res);
        });
        sendTo(defaultWsUri.url, defaultWsUri.channelId);
    });
}

function updateSettings(params){
    if(params){
        if(typeof params.maxAge !== "undefined"){
            maxAge = (Number(params.maxAge) > 0 ? Number(params.maxAge) : 30);
            minDate = getDateIntByAge(maxAge);
            setSettings("maxAge", maxAge);
        }
        if(typeof params.limit !== "undefined"){
            limit = (Number(params.limit) > 0 ? Number(params.limit) : 100000);
            setSettings("limit", limit);
        }
        if(typeof params.privateKey !== "undefined"){
            let keyPair;
            try {
                keyPair = bitcoinjs.ECPair.fromPrivateKey(bitcoinjs.Buffer.from(params.privateKey, 'hex'));
                myKeyPair = {publicKey: bitcoinjs.Buffer.from(keyPair.publicKey), privateKey: bitcoinjs.Buffer.from(keyPair.privateKey)};
            }catch(error) {
                keyPair = bitcoinjs.ECPair.makeRandom();
                myKeyPair = {publicKey: bitcoinjs.Buffer.from(keyPair.publicKey), privateKey: bitcoinjs.Buffer.from(keyPair.privateKey)};
            }
            setSettings("privateKey", myKeyPair.privateKey);
        }
    }else{
        constructor();
    }
}

function getSettings(f){
    let result = {};
    connectDB(function(db){
        const tx = db.transaction([objectStores.settings], "readwrite");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.settings).openCursor();
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if(cursor){
                result[cursor.value.param] = cursor.value.value;
                cursor.continue();
            }else{
                f(result);
            }
        };
    });
}

function setSettings(param, value){
    connectDB(function(db){
        const tx = db.transaction([objectStores.settings], "readwrite");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.settings).put({ param: param, value: value });
        request.onerror = logerr;
        request.onsuccess = (event) => {
            if(param === "privateKey"){
                postMessage("SETTINGS", { param: param, value: genQRString(value)});
            }else{
                postMessage("SETTINGS", { param: param, value: value });
            }
        };
    });
}

function genQRString(value){
    let providerQR = myKeyPair.publicKey.toString('hex') + " ws://" + self.location.host
    let dagest = bitcoinjs.crypto.hash256(myKeyPair.publicKey),
    key = bitcoinjs.ECPair.fromPrivateKey(myKeyPair.privateKey);
    let recipientQR = myKeyPair.publicKey.toString('hex') + " " + key.sign(dagest).toString('hex');
    let privateKey = value.toString('hex');
    return {providerQR: providerQR, recipientQR: recipientQR, privateKey: privateKey};
}

/* tests:
 
//sign
signMSG("hello world", function(publicKey, msg, sig){
    let res = verifyMSG(publicKey, msg, sig);
    logerr(res);
});

//db load
*/
function test_load(){
    for (step = 0; step < maxAge; step++) {
        let date = getDateIntByAge(step);
        let arr = [];
        let maxCount = Math.random() * (10000 - 1) + 1;
        for (s = 0; s < maxCount; s++) {
            let keyPair = bitcoinjs.ECPair.makeRandom();
            let hash = bitcoinjs.crypto.hash160(keyPair.publicKey);
            arr.push(hash);
        }
        insertPubKeys(arr, date);
    }
}

self.addEventListener('message', event => {
    if (event.data) {
        let data = event.data.data;
        if(event.data.type === "SYNC" && data.text.length > 74){
            let pubKey = bitcoinjs.Buffer.from(data.text.substring(0, 66), 'hex');
            if(data.role === 1){
                if(data.text.length === 195){
                    let sig = bitcoinjs.Buffer.from(data.text.substring(67), 'hex');
                    findPubKey(pubKey, function(res){
                        if(!verifyMSG(pubKey, pubKey, sig)){
                            postMessage("SYNC_ALERT", {alert: 0});
                        }else if(!res){
                            postMessage("SYNC_ALERT", {alert: 1});
                        }else{
                            sendTo(defaultWsUri.url, defaultWsUri.channelId);
                            postMessage("SYNC_ALERT", {alert: 2});
                        }
                    });
                }else{
                    postMessage("SYNC_ALERT", {alert: 3});
                }
            }else{
                insertPubKeys([pubKey], dateNow);
                
                let url = data.text.substring(67),
                    channelId = bitcoinjs.address.toBase58Check(bitcoinjs.crypto.hash160(pubKey), 1);
                    
                sendTo(url, channelId);
                sendTo(url, bitcoinjs.Buffer.from(new Uint8Array(2).fill(0), 0, 2));
                postMessage("SYNC_ALERT", {alert: 6});
            }
        }else if(event.data.type === "INIT"){
            updateSettings(event.data.data);
        }
    }
});

self.addEventListener("activate", (event) => {
    event.waitUntil(clients.claim());
});

constructor();