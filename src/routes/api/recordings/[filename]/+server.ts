import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';

const RECORDINGS_DIR = './recordings';
const JSON_EXTENSION = '.json';
const WEBM_EXTENSION = '.webm';
const SAFE_BASENAME = /^[a-zA-Z0-9._-]+$/;

class RequestError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export const DELETE: RequestHandler = async ({ params }) => {
	const { filename } = params;

	if (!isJsonFilename(filename)) {
		return json({ error: 'Invalid filename' }, { status: 400 });
	}

	try {
		const result = await mutateRecording(filename, { targetDeleted: true });
		return json({ success: true, filename: result.filename, deleted: result.deleted });
	} catch (error) {
		return handleRecordingError(error, 'delete recording');
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { filename } = params;

	if (!isJsonFilename(filename)) {
		return json({ error: 'Invalid filename' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { deleted, newBaseName } = body as {
			deleted?: unknown;
			newBaseName?: unknown;
		};

		const hasDeletedFlag = typeof deleted === 'boolean';
		const wantsRename = 'newBaseName' in body;

		let sanitizedBase: string | undefined;
		if (wantsRename) {
			sanitizedBase = sanitizeBaseName(newBaseName);
		}

		if (!hasDeletedFlag && sanitizedBase === undefined) {
			return json({ error: 'No updates provided' }, { status: 400 });
		}

		const result = await mutateRecording(filename, {
			targetDeleted: hasDeletedFlag ? (deleted as boolean) : undefined,
			newBaseName: sanitizedBase
		});

		return json({ success: true, filename: result.filename, deleted: result.deleted });
	} catch (error) {
		return handleRecordingError(error, 'update recording');
	}
};

function isJsonFilename(filename: string): boolean {
	return filename.endsWith(JSON_EXTENSION);
}

type MutationOptions = {
	targetDeleted?: boolean;
	newBaseName?: string;
};

type MutationResult = {
	filename: string;
	deleted: boolean;
};

async function mutateRecording(filename: string, options: MutationOptions): Promise<MutationResult> {
	const currentPath = path.join(RECORDINGS_DIR, filename);
	await fs.access(currentPath);

	const currentDeleted = filename.endsWith('_DELETED.json');
	const currentBase = stripJsonSuffix(filename);
	const targetDeleted = options.targetDeleted ?? currentDeleted;
	const targetBase = options.newBaseName ?? currentBase;

	if (!SAFE_BASENAME.test(targetBase)) {
		throw new RequestError('Recording name contains invalid characters', 400);
	}

	const targetFilename = buildJsonFilename(targetBase, targetDeleted);
	const targetPath = path.join(RECORDINGS_DIR, targetFilename);

	if (currentPath !== targetPath) {
		await assertPathAvailable(targetPath);
	}

	const content = await fs.readFile(currentPath, 'utf-8');
	const data = JSON.parse(content);

	const desiredAudio = await ensureAudioState(data, {
		targetDeleted,
		targetBase,
		currentBase
	});

	data.audio_file = desiredAudio;

	await fs.writeFile(currentPath, JSON.stringify(data, null, 2));

	if (currentPath !== targetPath) {
		await fs.rename(currentPath, targetPath);
	}

	return { filename: targetFilename, deleted: targetDeleted };
}

async function assertPathAvailable(targetPath: string) {
	try {
		await fs.access(targetPath);
		throw new RequestError('A recording with that name already exists', 409);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err?.code !== 'ENOENT') {
			throw err;
		}
	}
}

type AudioStateOptions = {
	targetDeleted: boolean;
	targetBase: string;
	currentBase: string;
};

async function ensureAudioState(
	data: { audio_file?: string },
	{ targetDeleted, targetBase, currentBase }: AudioStateOptions
) {
	const desiredAudio = buildAudioFilename(targetBase, targetDeleted);
	const candidates = new Set<string>();

	const rawAudio = coerceString(data.audio_file);
	if (rawAudio) {
		candidates.add(rawAudio);
		const stripped = stripDeletedSuffix(rawAudio, WEBM_EXTENSION);
		if (stripped) {
			candidates.add(stripped);
		}
		const deletedVariant = ensureDeletedSuffix(rawAudio, WEBM_EXTENSION);
		if (deletedVariant) {
			candidates.add(deletedVariant);
		}
	}

	candidates.add(buildAudioFilename(currentBase, false));
	candidates.add(buildAudioFilename(currentBase, true));
	candidates.add(desiredAudio);

	const existingAudio = await resolveExistingAudioFilename(candidates);

	if (existingAudio && existingAudio !== desiredAudio) {
		await renameAudio(existingAudio, desiredAudio);
	}

	data.audio_file = desiredAudio;
	return desiredAudio;
}

async function resolveExistingAudioFilename(candidates: Set<string>) {
	for (const candidate of candidates) {
		if (!candidate) continue;
		try {
			await fs.access(path.join(RECORDINGS_DIR, candidate));
			return candidate;
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err?.code !== 'ENOENT') {
				throw err;
			}
		}
	}

	return undefined;
}

async function renameAudio(from: string, to: string) {
	if (from === to) {
		return;
	}

	const fromPath = path.join(RECORDINGS_DIR, from);
	const toPath = path.join(RECORDINGS_DIR, to);

	try {
		await fs.rename(fromPath, toPath);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err?.code === 'ENOENT') {
			console.warn('Audio file missing during rename:', from);
			return;
		}
		if (err?.code === 'EEXIST') {
			throw new RequestError('Target audio filename already exists', 409);
		}
		throw err;
	}
}

function sanitizeBaseName(value: unknown) {
	if (typeof value !== 'string') {
		throw new RequestError('Recording name must be a string', 400);
	}
	const trimmed = value.trim().replace(/\.json$/i, '');
	if (!trimmed) {
		throw new RequestError('Recording name cannot be empty', 400);
	}
	if (!SAFE_BASENAME.test(trimmed)) {
		throw new RequestError('Recording name can only include letters, numbers, dots, underscores, or dashes', 400);
	}
	return trimmed;
}

function stripJsonSuffix(filename: string) {
	return filename.replace(/(_DELETED)?\.json$/, '');
}

function buildJsonFilename(baseName: string, deleted: boolean) {
	return `${baseName}${deleted ? '_DELETED' : ''}${JSON_EXTENSION}`;
}

function buildAudioFilename(baseName: string, deleted: boolean) {
	return `${baseName}${deleted ? '_DELETED' : ''}${WEBM_EXTENSION}`;
}

function coerceString(value: unknown) {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function stripDeletedSuffix(filename: string | undefined, extension: string) {
	if (!filename || !filename.endsWith(extension)) {
		return filename;
	}

	const deletedSuffix = `_DELETED${extension}`;
	if (filename.endsWith(deletedSuffix)) {
		return `${filename.slice(0, -deletedSuffix.length)}${extension}`;
	}

	return filename;
}

function ensureDeletedSuffix(filename: string | undefined, extension: string) {
	if (!filename || !filename.endsWith(extension)) {
		return filename;
	}

	const deletedSuffix = `_DELETED${extension}`;
	if (filename.endsWith(deletedSuffix)) {
		return filename;
	}

	return `${filename.slice(0, -extension.length)}${deletedSuffix}`;
}

function handleRecordingError(error: unknown, action: string) {
	if (error instanceof RequestError) {
		return json({ error: error.message }, { status: error.status });
	}

	const err = error as NodeJS.ErrnoException;
	if (err?.code === 'ENOENT') {
		return json({ error: 'Recording not found' }, { status: 404 });
	}

	console.error(`Failed to ${action}:`, error);
	return json({ error: `Failed to ${action}` }, { status: 500 });
}
