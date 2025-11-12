var websockets = [];

function logerr(err){
    console.log(err);
}

function sync(wsUri, data){
    let websocket = new WebSocket(wsUri);

    websocket.addEventListener("open", () => {
        logerr("CONNECTED");
        websockets.push(websocket);
        sendData(websocket, data);
    });

    websocket.addEventListener("close", () => {
        logerr("DISCONNECTED");
        websockets.filter(item => item !== websocket);
    });

    websocket.addEventListener("message", (e) => {
        logerr(`RECEIVED: ${e.data}`);
        postMessage([wsUri, e.data]);
    });

    websocket.addEventListener("error", (e) => {
        logerr(`ERROR: ${e.data}`);
        websockets.filter(item => item !== websocket);
    });
}

function sendData(websocket, data){
    if (data !== null){
        websocket.send(data);
    }
}

onmessage = (e) => {
    let websocket = websockets.find(user => user.url === e.data[0]);
    if (websocket === undefined){
       sync(e.data[0], e.data[1]);
    }else{
        sendData(websocket, e.data[1]);
    }
}