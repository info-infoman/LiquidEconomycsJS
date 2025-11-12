var websocket = null;

function logerr(err){
    console.log(err);
}

function sync(wsUri, data){
    websocket = new WebSocket(wsUri);

    websocket.addEventListener("open", () => {
        logerr("CONNECTED");
        data = sendData;
    });

    websocket.addEventListener("close", () => {
        logerr("DISCONNECTED");
        postMessage([wsUri, "ERROR"]);
    });

    websocket.addEventListener("message", (e) => {
        logerr(`RECEIVED: ${e.data}`);
        postMessage([wsUri, e.data]);
    });

    websocket.addEventListener("error", (e) => {
        logerr(`ERROR: ${e.data}`);
        postMessage([wsUri, "ERROR"]);
    });
}

function sendData(data){
    if (data !== null){
        websocket.send(data);
    }
}

onmessage = (e) => {
    if (websocket === null){
       sync(e.data[0], e.data[1]); 
    }else if(websocket.url !== e.data[0]){
        websocket.close();
        sync(e.data[0], e.data[1]);
    }else{
        e.data[1] = sendData;
    }
}