import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
	decodeTokenStream,
	encodeKeystrokeRecording,
	encodeRecordingFile,
	encodeRecordingFileWithMetadata,
	type RecordingFile
} from '../src/lib/server/recording/keycodeTranscoder.ts';

const recordingsDir = path.resolve('recordings');

async function loadRecording(filePath: string): Promise<RecordingFile> {
	const json = await fs.readFile(filePath, 'utf-8');
	return JSON.parse(json) as RecordingFile;
}

test('encode/decode is lossless for every recording JSON fixture', async (t) => {
	const files = await fs.readdir(recordingsDir);
	const jsonFiles = files.filter((file) => file.endsWith('.json'));

	assert.ok(jsonFiles.length > 0, 'No JSON recordings found to test.');

	for (const file of jsonFiles) {
		await t.test(`round trip ${file}`, async () => {
			const filePath = path.join(recordingsDir, file);
			const recording = await loadRecording(filePath);

			const encoded = encodeKeystrokeRecording(recording);
			const encodedFromFile = await encodeRecordingFile(filePath);
			assert.equal(encodedFromFile, encoded, 'File-based encoding should match direct encoding.');

			const { metadata } = await encodeRecordingFileWithMetadata(filePath);

			const decoded = decodeTokenStream(encoded, metadata);
			assert.deepEqual(decoded, recording, `Round trip output mismatch for ${file}.`);
		});
	}
});

test('encode and decode validate unsupported inputs', () => {
	assert.throws(
		() =>
			encodeKeystrokeRecording({
				keystrokes: [{ key: 'NotAKeyCode', event_type: 'keydown', timestamp: Date.now() }]
			}),
		/Unsupported key code/i
	);

	assert.throws(() => decodeTokenStream('notintable+123'), /Unknown token/i);
	assert.throws(() => decodeTokenStream('keya*123'), /Invalid token entry/i);
	assert.throws(() => decodeTokenStream('keya+123 keyb-456'), /Invalid token entry/i);
});
