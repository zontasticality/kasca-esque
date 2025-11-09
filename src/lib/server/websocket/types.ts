import type { WebSocket } from 'ws';

export interface KeystrokeEvent {
	type: 'keystroke';
	session_id: string;
	timestamp: number;
	key: string;
	event_type: 'keydown' | 'keyup';
}

export interface SessionAssigned {
	type: 'session_assigned';
	session_id: string;
}

export interface ClientListUpdate {
	type: 'client_list';
	clients: Array<{
		session_id: string;
		connected_at: number;
	}>;
}

export interface StartRecording {
	type: 'start_recording';
	keyboard_session_id: string;
	recording_id: string;
}

export interface StopRecording {
	type: 'stop_recording';
	recording_id: string;
}

export interface RecordingStarted {
	type: 'recording_started';
	recording_id: string;
	keyboard_session_id: string;
	start_timestamp: number;
}

export interface RecordingStopped {
	type: 'recording_stopped';
	recording_id: string;
	end_timestamp: number;
	filename: string;
}

export interface ErrorMessage {
	type: 'error';
	error: string;
	context?: Record<string, unknown>;
}

export type ServerMessage =
	| SessionAssigned
	| ClientListUpdate
	| RecordingStarted
	| RecordingStopped
	| ErrorMessage;

export type ClientMessage = KeystrokeEvent | StartRecording | StopRecording;

export interface KeyboardClient {
	session_id: string;
	connected_at: number;
	ws: WebSocket;
}

export interface ControlClient {
	session_id: string;
	connected_at: number;
	ws: WebSocket;
}

export interface AudioChunkHeader {
	recording_id: string;
	keyboard_session_id: string;
}
