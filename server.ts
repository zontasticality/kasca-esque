import { handler } from './build/handler.js';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from './lib/websocket/server.js';
import { promises as fs } from 'fs';
import path from 'path';

const app = express();
const recordingsDir = path.resolve('recordings');

app.get('/recordings', async (_req, res) => {
	try {
		const files = await fs.readdir(recordingsDir);
		const fileSet = new Set(files);
		const recordings = files
			.filter((file) => file.endsWith('.webm'))
			.reduce<{ audio: string; keylog: string }[]>((acc, file) => {
				const baseName = file.slice(0, -'.webm'.length);
				const jsonName = `${baseName}.json`;
				if (fileSet.has(jsonName)) {
					acc.push({ audio: file, keylog: jsonName });
				}
				return acc;
			}, []);

		res.json(recordings);
	} catch (error) {
		console.error('Failed to list recordings:', error);
		res.status(500).json({ error: 'Unable to list recordings' });
	}
});
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
