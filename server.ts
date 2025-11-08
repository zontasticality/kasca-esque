import { handler } from './build/handler.js';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from './lib/websocket/server.js';
const app = express();
const server = createServer(app);

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Create WebSocket servers
const wssKeyboard = new WebSocketServer({ noServer: true });
const wssControl = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
	const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

	if (pathname === '/ws/keyboard') {
		wssKeyboard.handleUpgrade(request, socket, head, (ws) => {
			wsManager.handleKeyboardConnection(ws, request);
		});
	} else if (pathname === '/ws/control') {
		wssControl.handleUpgrade(request, socket, head, (ws) => {
			wsManager.handleControlConnection(ws, request);
		});
	} else {
		socket.destroy();
	}
});

// Use SvelteKit handler for all regular HTTP requests
app.use(handler);

const port = process.env.PORT || 3000;
server.listen(port, () => {
	console.log(`Server running on http://localhost:${port}`);
	console.log(`WebSocket endpoints:`);
	console.log(`  - ws://localhost:${port}/ws/keyboard`);
	console.log(`  - ws://localhost:${port}/ws/control`);
});
