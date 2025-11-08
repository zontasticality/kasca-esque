import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

const RECORDINGS_DIR = './recordings';

export const GET: RequestHandler = async () => {
	try {
		const files = await fs.readdir(RECORDINGS_DIR);
		const jsonFiles = files.filter(
			(file) => file.endsWith('.json') && !file.includes('_DELETED')
		);

		const recordings = await Promise.all(
			jsonFiles.map(async (file) => {
				const filePath = path.join(RECORDINGS_DIR, file);
				const content = await fs.readFile(filePath, 'utf-8');
				const data = JSON.parse(content);
				return {
					filename: file,
					...data
				};
			})
		);

		// Sort by start timestamp, most recent first
		recordings.sort((a, b) => b.start_timestamp - a.start_timestamp);

		return json(recordings);
	} catch (error) {
		console.error('Error listing recordings:', error);
		return json({ error: 'Failed to list recordings' }, { status: 500 });
	}
};
