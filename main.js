const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the same HTTP server

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handling
wss.on('connection', function connection(ws, req) {
	//const parameters = url.parse(req.url, true);
	//ws.channelId = parameters.query.channelId;

	ws.on('message', function message(data, isBinary) {
		if (isBinary){
			console.log('isBinary');
			wss.clients.forEach(function each(client) {
				if (client !== ws && client.readyState === WebSocket.OPEN && client.channelId === ws.channelId) {
				client.send(data, { binary: true });
				}
			});
		}else{
			ws.channelId = data;
		}
	});

	ws.on('close', function close() {
		console.log('disconnected');
	});
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});