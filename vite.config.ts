import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type PluginOption } from 'vite';
import type { IncomingMessage } from 'http';
import type { Socket } from 'node:net';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from './lib/websocket/server';

function websocketDevPlugin(): PluginOption {
	return {
		name: 'dev-websocket-server',
		apply: 'serve',
		configureServer(server) {
			const httpServer = server.httpServer;
			if (!httpServer) {
				return;
			}

			const wsManager = new WebSocketManager();
			const wssKeyboard = new WebSocketServer({ noServer: true });
			const wssControl = new WebSocketServer({ noServer: true });

				const handleUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer) => {
					if (!request.url) {
						return;
					}

					const host = request.headers.host ?? 'localhost';
					const pathname = new URL(request.url, `http://${host}`).pathname;

					if (pathname === '/ws/keyboard') {
						wssKeyboard.handleUpgrade(request, socket, head, (ws) => {
							wsManager.handleKeyboardConnection(ws, request);
						});
						return;
					}

					if (pathname === '/ws/control') {
						wssControl.handleUpgrade(request, socket, head, (ws) => {
							wsManager.handleControlConnection(ws, request);
						});
						return;
					}

					// Not one of ours; let Vite's own upgrade handlers run
				};

				httpServer.on('upgrade', handleUpgrade);
			httpServer.once('close', () => {
				httpServer.off('upgrade', handleUpgrade);
				wssKeyboard.clients.forEach((client) => client.terminate());
				wssControl.clients.forEach((client) => client.terminate());
				wssKeyboard.close();
				wssControl.close();
			});

			console.log('[vite] WebSocket endpoints available at /ws/keyboard and /ws/control');
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), websocketDevPlugin()],
	server: {
		fs: {
			allow: ['recordings']
		}
	}
});
