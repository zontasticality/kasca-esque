import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

const RECORDINGS_DIR = path.resolve('recordings');

export const GET: RequestHandler = async () => {
	try {
		const files = await fs.readdir(RECORDINGS_DIR);
		const fileSet = new Set(files);

		const recordings = files
			.filter(
				(file) =>
					file.endsWith('.webm') && !file.endsWith('_DELETED.webm')
			)
			.reduce<{ audio: string; keylog: string }[]>((acc, file) => {
				const baseName = file.slice(0, -'.webm'.length);
				const jsonName = `${baseName}.json`;

				if (fileSet.has(jsonName)) {
					acc.push({ audio: file, keylog: jsonName });
				}

				return acc;
			}, []);

		return json(recordings);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return json([]);
		}

		console.error('Failed to list recordings:', error);
		return json({ error: 'Unable to list recordings' }, { status: 500 });
	}
};
