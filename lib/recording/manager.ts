import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { Blob as NodeBlob } from 'node:buffer';
import fixWebmDuration from 'fix-webm-duration';
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
		text?: string;
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

		const entry = {
			timestamp: keystroke.timestamp,
			key: keystroke.key,
			event_type: keystroke.event_type
		} as Recording['keystrokes'][number];

		if (typeof keystroke.text === 'string') {
			entry.text = keystroke.text;
		}

		recording.keystrokes.push(entry);
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
		const audioPath = path.join(this.recordingsDir, recording.audio_file);
		const durationSeconds = (endTimestamp - recording.start_timestamp) / 1000;

		await this.finalizeAudioFile(audioPath, durationSeconds);

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

	private async finalizeAudioFile(audioPath: string, durationSeconds: number): Promise<void> {
		const durationMs = Math.max(0, Math.round(durationSeconds * 1000));
		const BlobImpl = typeof Blob !== 'undefined' ? Blob : NodeBlob;
		this.ensureFileReaderPolyfill();

		try {
			const fileBuffer = await fs.readFile(audioPath);
			const blob = new BlobImpl([fileBuffer], { type: 'audio/webm' }) as unknown as Blob;
			const fixedBlob = (await fixWebmDuration(blob, durationMs, { logger: false })) as Blob;
			const arrayBuffer = await fixedBlob.arrayBuffer();
			await fs.writeFile(audioPath, Buffer.from(arrayBuffer));
		} catch (error) {
			console.warn('Failed to finalize WebM recording; playback duration may be unavailable:', error);
		}
	}

	private ensureFileReaderPolyfill(): void {
		if (typeof globalThis.FileReader !== 'undefined') {
			return;
		}

		class NodeFileReader {
			result: ArrayBuffer | null = null;
			onloadend: (() => void) | null = null;

			readAsArrayBuffer(blob: Blob): void {
				blob
					.arrayBuffer()
					.then((buffer) => {
						this.result = buffer;
						this.onloadend?.();
					})
					.catch(() => {
						this.result = null;
						this.onloadend?.();
					});
			}
		}

		// @ts-expect-error - provide a minimal FileReader implementation for Node.js
		globalThis.FileReader = NodeFileReader;
	}
}
