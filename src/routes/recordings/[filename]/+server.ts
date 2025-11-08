import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';

const RECORDINGS_DIR = './recordings';

export const GET: RequestHandler = async ({ params, request }) => {
	const { filename } = params;

	// Validate filename to prevent directory traversal
	if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
		throw error(400, 'Invalid filename');
	}

	const filePath = path.join(RECORDINGS_DIR, filename);

	// Check if file exists
	if (!existsSync(filePath)) {
		throw error(404, 'File not found');
	}

	const stats = statSync(filePath);
	const fileSize = stats.size;

	// Determine content type based on file extension
	const ext = path.extname(filename).toLowerCase();
	const contentType = ext === '.webm' ? 'audio/webm' : ext === '.json' ? 'application/json' : 'application/octet-stream';

	// Handle range requests for audio seeking
	const range = request.headers.get('range');

	if (range) {
		// Parse range header (e.g., "bytes=0-1023")
		const parts = range.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

		if (start >= fileSize || end >= fileSize) {
			return new Response(null, {
				status: 416,
				headers: {
					'Content-Range': `bytes */${fileSize}`
				}
			});
		}

		const chunkSize = end - start + 1;
		const fileHandle = await fs.open(filePath, 'r');
		const buffer = new Uint8Array(chunkSize);
		await fileHandle.read(buffer, 0, chunkSize, start);
		await fileHandle.close();

		return new Response(buffer, {
			status: 206,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${fileSize}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': chunkSize.toString(),
				'Content-Type': contentType
			}
		});
	}

	// Serve entire file
	const file = await fs.readFile(filePath);

	return new Response(file, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Length': fileSize.toString(),
			'Accept-Ranges': 'bytes'
		}
	});
};
