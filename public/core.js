importScripts('https://cdn.jsdelivr.net/npm/bitcoinjs-lib-browser@5.1.7/bitcoinjs.min.js');

const maxAge = 30, baseName = "appBase", limit = 100000,
    sync = new Worker('/sync.js'),
    objectStores = 
    {
        accounts : "accounts",
        mainCount : "mainCount",
        main : "main"
    };
var pubKeyMin = new Uint8Array(20), pubKeyMax = new Uint8Array(20),
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
        accounts = db.createObjectStore(objectStores.accounts, { keyPath: "publicKey" }),
        main = db.createObjectStore(objectStores.main, { keyPath: "pubKey" }),
        mainCount = db.createObjectStore(objectStores.mainCount, { keyPath: "date" });

        main.createIndex("idx_pubKey_date", ["pubKey", "date"], { unique: true });

        connectDB(f);
    }
}

function getRandomIntInclusive(date, f) {
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
    let skipCount = 0;
    let retrievedCount = 0;
    const results = [];
    connectDB(function(db){
        const tx = db.transaction([objectStores.main], "readonly");
        tx.onerror = logerr;
        const keyRange = IDBKeyRange.bound([pubKeyMin, date], [pubKeyMax, date]);
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

/*
msg format:
From provider service:
msgType(1byte) + age(1byte) + pubKeys(array of 20byte hash - similar bitcoin adress)
From consumer service:
msgType(1byte) + age(1byte)
*/
function generateAnswer(wsUri, msg){
    if(bitcoinjs.Buffer.byteLength(msg) >= 2){
        let request = [],
            getHashs = bitcoinjs.Buffer.from(new Uint8Array(1).fill(0), 0, 1),
            hashs = bitcoinjs.Buffer.from(new Uint8Array(1).fill(1), 0, 1),
            msgType = bitcoinjs.Buffer.from(msg, 0, 1),
            age = bitcoinjs.Buffer.from(msg, 1, 1);
        if(age[0] >= 0 && age[0] <= maxAge){
            let date = getDateIntByAge(age[0]);
            if (msgType === getHashs){
                request.push(hashs);
                request.push(age);
                getRandomIntInclusive(date, function(offset){
                    getPubKeys(date, offset, limit, function(arr){
                        for (let i = 0; i < arr.length; i++) {
                            request.push(bitcoinjs.Buffer.from(arr[i]));
                        }
                        sync.postMessage([wsUri, bitcoinjs.Buffer.concat(request)]);
                    });
                });   
            }else{
                let pubKeys = [];
                for (let i = 0; i < limit || 2 + (i * 20) > msg.byteLength; i++) {
                    pubKeys.push(bitcoinjs.Buffer.from(msg, 2 + (i * 20), 20));
                }
                insertPubKeys(pubKeys, date);
                let nextAge = new Uint8Array(1);
                nextAge.fill(age[0] + 1);
                request.push(getHashs);
                request.push(bitcoinjs.Buffer.from(nextAge, 0, 1));
                sync.postMessage([wsUri, bitcoinjs.Buffer.concat(request)]); 
            }
        }
    }
}

function getDefaultWsUri(f){
    getMyKey(function(keyPair){
        f(  
            { 
                "wsUri": "ws://" + self.location.host,
                "channelId": bitcoinjs.address.toBase58Check(bitcoinjs.crypto.hash160(keyPair.publicKey), 1)
            }
        );
    });
}

deleteOldKeys();

sync.onmessage = (e) => {
    generateAnswer(e.data[0], e.data[1]); 
};

getDefaultWsUri(function(res){
    sync.postMessage([res.wsUri, res.channelId]);
});

onmessage = (e) => {
    let res = null;
    if(e.data[0] === "generateQrCodeString"){
        getMyKey(function(keyPair){
            res = keyPair.publicKey.toString('hex');
            if (e.data[1] === 1){//provider
                res = res + " ws://" + self.location.host;
            }else{
                let dagest = bitcoinjs.crypto.hash256(keyPair.publicKey); 
                let key = bitcoinjs.ECPair.fromPrivateKey(keyPair.privateKey);
                res = res + " " + key.sign(dagest).toString('hex');
            }
            postMessage([e.data[0], res]);
        });
        
    }else if(e.data[0] === "sync" && e.data[1][1].length > 74){
        let pubKey = bitcoinjs.Buffer.from(e.data[1][1].substring(0, 66), 'hex');
        if(e.data[1][0] === 1){
            if(e.data[1][1].length === 195){
                let sig = bitcoinjs.Buffer.from(e.data[1][1].substring(67, 128), 'hex');
                findPubKey(pubKey, function(res){
                    if(res && verifyMSG(pubKey, pubKey, sig)){
                        getDefaultWsUri(function(res){
                            sync.postMessage([res.wsUri, res.channelId]);
                        });
                        postMessage([e.data[0], true]);
                    }else{
                        postMessage([e.data[0], false]);
                    }
                });
            }
        }else{
            insertPubKeys([pubKey], dateNow);

            let wsUri = e.data[1][1].substring(67, e.data[1][1].length - 67),
            channelId = bitcoinjs.address.toBase58Check(bitcoinjs.crypto.hash160(pubKey), 1),
            request = [];

            sync.postMessage([wsUri, channelId]);
            request.push(bitcoinjs.Buffer.from(new Uint8Array(2).fill(0), 0, 2));
            sync.postMessage([wsUri, request]);
        }
    }
}
//postMessage();


/* tests:
 
//sign
signMSG("hello world", function(publicKey, msg, sig){
    let res = verifyMSG(publicKey, msg, sig);
    logerr(res);
});

//db load
let arr = [];
for (step = 0; step < 10000; step++) {
    let keyPair = bitcoinjs.ECPair.makeRandom();
    let hash = bitcoinjs.crypto.hash160(keyPair.publicKey);
    arr.push(hash);
}
insertPubKeys(arr, dateNow);

*/