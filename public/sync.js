var websocket = null;

function logerr(err){
    console.log(err);
}

function sync(wsUri, data){
    websocket = new WebSocket(wsUri);

    websocket.addEventListener("open", () => {
        logerr("CONNECTED");
        websocket.send(data);
    });

    websocket.addEventListener("close", () => {
        logerr("DISCONNECTED");
    });

    websocket.addEventListener("message", (e) => {
        logerr(`RECEIVED: ${e.data}`);
        postMessage(e.data);
    });

    websocket.addEventListener("error", (e) => {
        logerr(`ERROR: ${e.data}`);
    });
}

onmessage = (e) => {
    if (websocket == null){
       sync(e.data[0], e.data[1]); 
    }else{
        websocket.send(e.data[1]);
    }
}