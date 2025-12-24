import type { WebSocket } from 'ws';

export interface KeystrokeEvent {
	type: 'keystroke';
	session_id: string;
	timestamp: number;
	key: string;
	event_type: 'keydown' | 'keyup';
}

export interface MouseClickEvent {
	type: 'mouseclick';
	session_id: string;
	timestamp: number;
	button: 0 | 1 | 2; // left, middle, right
	x: number;
	y: number;
	event_type: 'mousedown' | 'mouseup';
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
	final_text?: string;
}

export interface RequestFinalText {
	type: 'request_final_text';
	recording_id: string;
}

export interface FinalTextResponse {
	type: 'final_text_response';
	recording_id: string;
	final_text: string;
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
	| RequestFinalText
	| ErrorMessage;

export type ClientMessage = KeystrokeEvent | MouseClickEvent | StartRecording | StopRecording | FinalTextResponse;

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
