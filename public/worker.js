importScripts('https://cdn.jsdelivr.net/npm/bitcoinjs-lib-browser@5.1.7/bitcoinjs.min.js');

const maxAge = 30, baseName = "appBase", 
objectStores = 
    {
        syncServers : "syncServers",
        accounts : "accounts",
        mainCount : "mainCount",
        main : "main"
    };
var provideService = false;
    pubKeyMin = new Uint8Array(20), pubKeyMax = new Uint8Array(20),
    minDate = 0, dateNow = 0;

minDate = getDateIntByAge(maxAge);
dateNow = getDateIntByAge(0);
pubKeyMin.fill(0);
pubKeyMax.fill(255); 

function logerr(err){
    console.log(err);
}

function getDateIntByAge(age){
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - age);
    let year = pastDate.getFullYear(); 
    let month = pastDate.getMonth() + 1;
    let day = pastDate.getDate();
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
        syncServers = db.createObjectStore(objectStores.syncServers, { keyPath: "server" }),
        accounts = db.createObjectStore(objectStores.accounts, { keyPath: "publicKey" }),
        main = db.createObjectStore(objectStores.main, { keyPath: "pubKey" }),
        mainCount = db.createObjectStore(objectStores.mainCount, { keyPath: "date" });

        main.createIndex("idx_pubKey_date", ["pubKey", "date"], { unique: true });

        connectDB(f);
    }
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

function getPubKeys(data, offset, limit){
    return new Promise((resolve, reject) => {
        let skipCount = 0;
        let retrievedCount = 0;
        const results = [];
        connectDB(function(db){
            const tx = db.transaction([objectStores.main], "readonly");
            tx.onerror = logerr;
            const keyRange = IDBKeyRange.bound([pubKeyMin, date], [pubKeyMax, data]);
            let request = tx.objectStore(objectStores.main).index("idx_pubKey_date").openCursor(keyRange);
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
                        resolve(results); // Limit reached
                    }
                } else {
                    resolve(results); // No more records
                }
            };
        });
    });
}

function insertPubKeys(pubKeys, date){
    connectDB(function(db){
        var count = 0;
        const tx = db.transaction([objectStores.main], "readwrite");
        tx.onerror = logerr;
        pubKeys.forEach(pubKey => {
            const keyRange = IDBKeyRange.bound([pubKey, date], [pubKey, dateNow]);
            let request = tx.objectStore(objectStores.main).index("idx_pubKey_date").openCursor(keyRange);
            request.onerror = logerr;
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (!cursor) {
                    let request = tx.objectStore(objectStores.main).put({ "pubKey": pubKey, "date": date });
                    request.onerror = logerr;
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            count++;
                        }
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
        const keyRange = IDBKeyRange.bound([pubKeyMin, 0], [pubKeyMax, minDate]);
        let request = tx.objectStore(objectStores.main).index("idx_pubKey_date").openCursor(keyRange);
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
            }
        };
        const keyRangeCounts = IDBKeyRange.bound(0, minDate);
        const requestCounts = tx.objectStore(objectStores.mainCount).openCursor(keyRange);
        requestCounts.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
            }
        };
    });
}

function getMyKey(f){
    connectDB(function(db){
        const tx = db.transaction([objectStores.accounts], "readwrite");
        tx.onerror = logerr;
        let request = tx.objectStore(objectStores.accounts).openCursor();
        request.onerror = logerr;
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                f(
                    {
                        "publicKey": bitcoinjs.Buffer.from(cursor.value.publicKey), 
                        "privateKey": bitcoinjs.Buffer.from(cursor.value.privateKey)
                    }
                );
            } else {
                var keyPair = bitcoinjs.ECPair.makeRandom();
                let request = tx.objectStore(objectStores.accounts).put({ 
                    "publicKey": keyPair.publicKey, 
                    "privateKey": keyPair.privateKey 
                });
                f(
                    {
                        "publicKey": bitcoinjs.Buffer.from(keyPair.publicKey), 
                        "privateKey": bitcoinjs.Buffer.from(keyPair.privateKey)
                    }
                );
            }
        };
    });
}

function signMSG(msg, f){
    let hashMSG = bitcoinjs.crypto.hash256(msg); 
    getMyKey(function(keyPair){
        let key = bitcoinjs.ECPair.fromPrivateKey(keyPair.privateKey);
        f(keyPair.publicKey, msg, key.sign(hashMSG));
    });
}

function verifyMSG(publicKey, msg, sig){
    let hashMSG = bitcoinjs.crypto.hash256(msg);
    let key = bitcoinjs.ECPair.fromPublicKey(publicKey);
    return key.verify(hashMSG, sig);
}

/* test sign*/
signMSG("hello world", function(publicKey, msg, sig){
    let res = verifyMSG(publicKey, msg, sig);
    logerr(res);
}); 
/**/

//sync
function sync(){
    const wsUri = "ws://127.0.0.1/";
    websocket = new WebSocket(wsUri);

    websocket.addEventListener("open", () => {
        logerr("CONNECTED");
        websocket.send("ping");
    });

    websocket.addEventListener("close", () => {
        logerr("DISCONNECTED");
    });

    websocket.addEventListener("message", (e) => {
        logerr(`RECEIVED: ${e.data}`);
    });

    websocket.addEventListener("error", (e) => {
        logerr(`ERROR: ${e.data}`);
    });
}


deleteOldKeys();
insertPubKeys([125, 126], dateNow);