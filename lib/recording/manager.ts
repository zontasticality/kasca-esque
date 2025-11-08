import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import type { KeystrokeEvent } from '../websocket/types';

export interface Recording {
	recording_id: string;
	start_timestamp: number;
	end_timestamp?: number;
	keyboard_session_id: string;
	control_session_id: string;
	keystrokes: Array<{
		timestamp: number;
		key: string;
		event_type: 'keydown' | 'keyup';
	}>;
	audio_file: string;
}

export class RecordingManager {
	private recordings: Map<string, Recording> = new Map();
	private audioWriteStreams: Map<string, fs.FileHandle> = new Map();
	private recordingsDir = './recordings';

	constructor() {
		this.ensureRecordingsDir();
	}

	private async ensureRecordingsDir() {
		if (!existsSync(this.recordingsDir)) {
			await fs.mkdir(this.recordingsDir, { recursive: true });
		}
	}

	async startRecording(
		recordingId: string,
		keyboardSessionId: string,
		controlSessionId: string,
		startTimestamp: number
	): Promise<void> {
		const audioFilename = this.generateFilename(startTimestamp, 'webm');
		const audioPath = path.join(this.recordingsDir, audioFilename);

		// Create audio file
		const fileHandle = await fs.open(audioPath, 'w');
		this.audioWriteStreams.set(recordingId, fileHandle);

		// Initialize recording metadata
		const recording: Recording = {
			recording_id: recordingId,
			start_timestamp: startTimestamp,
			keyboard_session_id: keyboardSessionId,
			control_session_id: controlSessionId,
			keystrokes: [],
			audio_file: audioFilename
		};

		this.recordings.set(recordingId, recording);
	}

	async appendAudioChunk(recordingId: string, chunk: Buffer): Promise<void> {
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (!fileHandle) {
			throw new Error(`No audio stream found for recording ${recordingId}`);
		}

		await fileHandle.write(chunk);
	}

	addKeystroke(recordingId: string, keystroke: KeystrokeEvent): void {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			console.warn(`Recording ${recordingId} not found for keystroke`);
			return;
		}

		recording.keystrokes.push({
			timestamp: keystroke.timestamp,
			key: keystroke.key,
			event_type: keystroke.event_type
		});
	}

	async stopRecording(recordingId: string, endTimestamp: number): Promise<string> {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			throw new Error(`Recording ${recordingId} not found`);
		}

		// Close audio file
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (fileHandle) {
			await fileHandle.close();
			this.audioWriteStreams.delete(recordingId);
		}

		// Update end timestamp
		recording.end_timestamp = endTimestamp;

		// Write JSON metadata
		const jsonFilename = this.generateFilename(recording.start_timestamp, 'json');
		const jsonPath = path.join(this.recordingsDir, jsonFilename);

		await fs.writeFile(jsonPath, JSON.stringify(recording, null, 2), 'utf-8');

		// Clean up from memory
		this.recordings.delete(recordingId);

		return jsonFilename;
	}

	getRecordingByKeyboardSession(keyboardSessionId: string): string | null {
		for (const [recordingId, recording] of this.recordings.entries()) {
			if (recording.keyboard_session_id === keyboardSessionId) {
				return recordingId;
			}
		}
		return null;
	}

	isRecording(recordingId: string): boolean {
		return this.recordings.has(recordingId);
	}

	private generateFilename(timestamp: number, extension: string): string {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');

		return `recording_${year}${month}${day}_${hours}${minutes}${seconds}.${extension}`;
	}
}
