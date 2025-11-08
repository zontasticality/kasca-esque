import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { randomUUID } from 'crypto';
import type {
	KeyboardClient,
	ControlClient,
	KeystrokeEvent,
	StartRecording,
	StopRecording,
	ServerMessage,
	AudioChunkHeader
} from './types';
import { RecordingManager } from '../recording/manager';

export class WebSocketManager {
	private keyboardClients: Map<string, KeyboardClient> = new Map();
	private controlClients: Map<string, ControlClient> = new Map();
	private recordingManager: RecordingManager;

	constructor() {
		this.recordingManager = new RecordingManager();
	}

	handleKeyboardConnection(ws: WebSocket, req: IncomingMessage): void {
		const sessionId = randomUUID();
		const client: KeyboardClient = {
			session_id: sessionId,
			connected_at: Date.now(),
			ws
		};

		this.keyboardClients.set(sessionId, client);

		// Send session assignment
		this.sendMessage(ws, {
			type: 'session_assigned',
			session_id: sessionId
		});

		// Broadcast updated client list to control clients
		this.broadcastClientList();

		// Handle messages
		ws.on('message', (data: Buffer) => {
			try {
				const message = JSON.parse(data.toString()) as KeystrokeEvent;
				this.handleKeystrokeEvent(sessionId, message);
			} catch (error) {
				console.error('Error parsing keyboard message:', error);
			}
		});

		// Handle disconnect
		ws.on('close', () => {
			this.keyboardClients.delete(sessionId);
			this.broadcastClientList();

			// Auto-stop any active recording for this keyboard
			const recordingId = this.recordingManager.getRecordingByKeyboardSession(sessionId);
			if (recordingId) {
				this.stopRecordingInternal(recordingId, Date.now());
			}
		});

		ws.on('error', (error) => {
			console.error(`Keyboard client ${sessionId} error:`, error);
		});
	}

	handleControlConnection(ws: WebSocket, req: IncomingMessage): void {
		const sessionId = randomUUID();
		const client: ControlClient = {
			session_id: sessionId,
			connected_at: Date.now(),
			ws
		};

		this.controlClients.set(sessionId, client);

		// Send session assignment
		this.sendMessage(ws, {
			type: 'session_assigned',
			session_id: sessionId
		});

		// Send current client list
		this.sendClientList(ws);

		// Handle messages
		ws.on('message', (data: Buffer | string) => {
			// Check if it's binary data (audio chunk)
			if (data instanceof Buffer || data instanceof ArrayBuffer) {
				this.handleAudioChunk(sessionId, data as Buffer);
			} else {
				// Text message (JSON)
				try {
					const message = JSON.parse(data.toString());
					this.handleControlMessage(sessionId, message);
				} catch (error) {
					console.error('Error parsing control message:', error);
				}
			}
		});

		// Handle disconnect
		ws.on('close', () => {
			this.controlClients.delete(sessionId);
		});

		ws.on('error', (error) => {
			console.error(`Control client ${sessionId} error:`, error);
		});
	}

	private handleKeystrokeEvent(sessionId: string, event: KeystrokeEvent): void {
		// Find if this keyboard is being recorded
		const recordingId = this.recordingManager.getRecordingByKeyboardSession(sessionId);
		if (recordingId) {
			this.recordingManager.addKeystroke(recordingId, event);
		}
	}

	private handleControlMessage(
		sessionId: string,
		message: StartRecording | StopRecording
	): void {
		if (message.type === 'start_recording') {
			this.handleStartRecording(sessionId, message);
		} else if (message.type === 'stop_recording') {
			this.handleStopRecording(sessionId, message);
		}
	}

	private async handleStartRecording(
		controlSessionId: string,
		message: StartRecording
	): Promise<void> {
		// Verify keyboard client exists
		if (!this.keyboardClients.has(message.keyboard_session_id)) {
			const client = this.controlClients.get(controlSessionId);
			if (client) {
				this.sendMessage(client.ws, {
					type: 'error',
					error: 'Keyboard client not found',
					context: { keyboard_session_id: message.keyboard_session_id }
				});
			}
			return;
		}

		const startTimestamp = Date.now();

		try {
			await this.recordingManager.startRecording(
				message.recording_id,
				message.keyboard_session_id,
				controlSessionId,
				startTimestamp
			);

			// Send confirmation
			const client = this.controlClients.get(controlSessionId);
			if (client) {
				this.sendMessage(client.ws, {
					type: 'recording_started',
					recording_id: message.recording_id,
					keyboard_session_id: message.keyboard_session_id,
					start_timestamp: startTimestamp
				});
			}
		} catch (error) {
			const client = this.controlClients.get(controlSessionId);
			if (client) {
				this.sendMessage(client.ws, {
					type: 'error',
					error: `Failed to start recording: ${error}`,
					context: { recording_id: message.recording_id }
				});
			}
		}
	}

	private async handleStopRecording(
		controlSessionId: string,
		message: StopRecording
	): Promise<void> {
		const endTimestamp = Date.now();
		await this.stopRecordingInternal(message.recording_id, endTimestamp, controlSessionId);
	}

	private async stopRecordingInternal(
		recordingId: string,
		endTimestamp: number,
		controlSessionId?: string
	): Promise<void> {
		if (!this.recordingManager.isRecording(recordingId)) {
			return;
		}

		try {
			const filename = await this.recordingManager.stopRecording(recordingId, endTimestamp);

			// Send confirmation to control client if provided
			if (controlSessionId) {
				const client = this.controlClients.get(controlSessionId);
				if (client) {
					this.sendMessage(client.ws, {
						type: 'recording_stopped',
						recording_id: recordingId,
						end_timestamp: endTimestamp,
						filename
					});
				}
			}
		} catch (error) {
			console.error('Error stopping recording:', error);
			if (controlSessionId) {
				const client = this.controlClients.get(controlSessionId);
				if (client) {
					this.sendMessage(client.ws, {
						type: 'error',
						error: `Failed to stop recording: ${error}`,
						context: { recording_id: recordingId }
					});
				}
			}
		}
	}

	private async handleAudioChunk(controlSessionId: string, data: Buffer): Promise<void> {
		// Parse header (first 72 bytes: 36 for recording_id + 36 for keyboard_session_id)
		if (data.length < 72) {
			console.error('Audio chunk too small');
			return;
		}

		const recordingId = data.subarray(0, 36).toString('utf-8').trim();
		const keyboardSessionId = data.subarray(36, 72).toString('utf-8').trim();
		const audioData = data.subarray(72);

		try {
			await this.recordingManager.appendAudioChunk(recordingId, audioData);
		} catch (error) {
			console.error('Error appending audio chunk:', error);
			const client = this.controlClients.get(controlSessionId);
			if (client) {
				this.sendMessage(client.ws, {
					type: 'error',
					error: `Failed to write audio chunk: ${error}`,
					context: { recording_id: recordingId }
				});
			}
		}
	}

	private sendMessage(ws: WebSocket, message: ServerMessage): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	private broadcastClientList(): void {
		this.controlClients.forEach((client) => {
			this.sendClientList(client.ws);
		});
	}

	private sendClientList(ws: WebSocket): void {
		const clients = Array.from(this.keyboardClients.values()).map((client) => ({
			session_id: client.session_id,
			connected_at: client.connected_at
		}));

		this.sendMessage(ws, {
			type: 'client_list',
			clients
		});
	}
}
