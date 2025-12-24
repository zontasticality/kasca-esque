import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { KeystrokeEvent } from '../websocket/types';

const execAsync = promisify(exec);

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
	mouse_events: Array<{
		timestamp: number;
		button: 0 | 1 | 2;
		x: number;
		y: number;
		event_type: 'mousedown' | 'mouseup';
	}>;
	final_text?: string;
	audio_file: string;
}

export class RecordingManager {
	private recordings: Map<string, Recording> = new Map();
	private audioWriteStreams: Map<string, fs.FileHandle> = new Map();
	private writeQueues: Map<string, Promise<void>> = new Map();
	private recordingsDir = './recordings';
	private randomWriteDelayMaxMs: number | null;

	constructor() {
		this.ensureRecordingsDir();
		this.randomWriteDelayMaxMs = this.parseRandomWriteDelay();
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
			mouse_events: [],
			audio_file: audioFilename
		};

		this.recordings.set(recordingId, recording);
	}

	async appendAudioChunk(recordingId: string, chunk: Buffer): Promise<void> {
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (!fileHandle) {
			throw new Error(`No audio stream found for recording ${recordingId}`);
		}

		const previous = this.writeQueues.get(recordingId) ?? Promise.resolve();
		const next = previous.then(async () => {
			await this.maybeApplyRandomWriteDelay();
			await fileHandle.write(chunk);
		});

		this.writeQueues.set(recordingId, next.catch(() => { }));
		await next;
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

	addMouseEvent(recordingId: string, mouseEvent: {
		timestamp: number;
		button: 0 | 1 | 2;
		x: number;
		y: number;
		event_type: 'mousedown' | 'mouseup';
	}): void {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			console.warn(`Recording ${recordingId} not found for mouse event`);
			return;
		}

		recording.mouse_events.push({
			timestamp: mouseEvent.timestamp,
			button: mouseEvent.button,
			x: mouseEvent.x,
			y: mouseEvent.y,
			event_type: mouseEvent.event_type
		});
	}

	setFinalText(recordingId: string, finalText: string): void {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			console.warn(`Recording ${recordingId} not found for final text`);
			return;
		}

		recording.final_text = finalText;
	}

	async stopRecording(recordingId: string, endTimestamp: number): Promise<string> {
		const recording = this.recordings.get(recordingId);
		if (!recording) {
			throw new Error(`Recording ${recordingId} not found`);
		}

		const pendingWrites = this.writeQueues.get(recordingId);
		if (pendingWrites) {
			try {
				await pendingWrites;
			} finally {
				this.writeQueues.delete(recordingId);
			}
		}

		// Close audio file
		const fileHandle = this.audioWriteStreams.get(recordingId);
		if (fileHandle) {
			await fileHandle.close();
			this.audioWriteStreams.delete(recordingId);
		}

		// Fix WebM duration metadata
		const audioPath = path.join(this.recordingsDir, recording.audio_file);
		try {
			await this.fixWebMDuration(audioPath);
			console.log(`Fixed duration metadata for ${recording.audio_file}`);
		} catch (error) {
			console.error(`Failed to fix WebM duration for ${recording.audio_file}:`, error);
			// Continue anyway - file is still playable, just without duration
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

	getKeyboardSessionForRecording(recordingId: string): string | null {
		const recording = this.recordings.get(recordingId);
		return recording?.keyboard_session_id ?? null;
	}

	private async fixWebMDuration(filePath: string): Promise<void> {
		// Create temporary file path
		const tempPath = `${filePath}.temp.webm`;

		// Use ffmpeg to remux the file, which will properly write the duration metadata
		// -i: input file
		// -c copy: copy streams without re-encoding (fast)
		// -y: overwrite output file if exists
		// -loglevel error: only show errors, not info messages
		const command = `ffmpeg -loglevel error -i "${filePath}" -c copy -y "${tempPath}"`;

		try {
			const { stdout, stderr } = await execAsync(command);

			if (stderr) {
				console.error('ffmpeg stderr:', stderr);
			}

			// Verify temp file was created and has content
			if (!existsSync(tempPath)) {
				throw new Error('ffmpeg did not create output file');
			}

			const tempStats = await fs.stat(tempPath);
			if (tempStats.size === 0) {
				throw new Error('ffmpeg created empty output file');
			}

			// Replace original with fixed version
			await fs.unlink(filePath);
			await fs.rename(tempPath, filePath);
		} catch (error) {
			console.error('ffmpeg error:', error);
			// Clean up temp file if it exists
			if (existsSync(tempPath)) {
				await fs.unlink(tempPath);
			}
			throw error;
		}
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

	private parseRandomWriteDelay(): number | null {
		const raw = process.env.RANDOM_CHUNK_DELAY_MAX_MS;
		if (!raw) {
			return null;
		}

		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}

		console.warn(
			`RANDOM_CHUNK_DELAY_MAX_MS="${raw}" is not a positive number; ignoring debug delay.`
		);
		return null;
	}

	private async maybeApplyRandomWriteDelay(): Promise<void> {
		if (!this.randomWriteDelayMaxMs) {
			return;
		}

		const delay = Math.floor(Math.random() * this.randomWriteDelayMaxMs);
		if (delay <= 0) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, delay));
	}
}
