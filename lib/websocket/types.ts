import type { WebSocket } from 'ws';

// Unified recording events - sent from keyboard client during recording
export type RecordingEvent =
	| { type: 'keydown'; ts: number; key: string }
	| { type: 'keyup'; ts: number; key: string }
	| { type: 'mousedown'; ts: number; pos: number }  // Sets selection anchor
	| { type: 'mouseup'; ts: number; selectionStart?: number; selectionEnd?: number }  // Final selection bounds
	| { type: 'select'; ts: number; delta: number };  // Selection offset from anchor

// Wrapper for sending events over WebSocket (includes session_id)
export interface RecordingEventMessage {
	type: 'event';
	session_id: string;
	event: RecordingEvent;
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

export type ClientMessage = RecordingEventMessage | FinalTextResponse | StartRecording | StopRecording;

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
