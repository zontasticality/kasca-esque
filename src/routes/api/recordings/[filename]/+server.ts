import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

const RECORDINGS_DIR = './recordings';

export const DELETE: RequestHandler = async ({ params }) => {
	const { filename } = params;

	if (!filename.endsWith('.json')) {
		return json({ error: 'Invalid filename' }, { status: 400 });
	}

	const oldPath = path.join(RECORDINGS_DIR, filename);
	const newFilename = filename.replace('.json', '_DELETED.json');
	const newPath = path.join(RECORDINGS_DIR, newFilename);

	try {
		// Read the recording to get audio filename
		const content = await fs.readFile(oldPath, 'utf-8');
		const data = JSON.parse(content);

		// Rename JSON file
		await fs.rename(oldPath, newPath);

		// Rename audio file if it exists
		if (data.audio_file) {
			const oldAudioPath = path.join(RECORDINGS_DIR, data.audio_file);
			const newAudioFilename = data.audio_file.replace('.webm', '_DELETED.webm');
			const newAudioPath = path.join(RECORDINGS_DIR, newAudioFilename);

			try {
				await fs.rename(oldAudioPath, newAudioPath);
			} catch (error) {
				console.warn('Audio file not found or already deleted:', data.audio_file);
			}
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting recording:', error);
		return json({ error: 'Failed to delete recording' }, { status: 500 });
	}
};
