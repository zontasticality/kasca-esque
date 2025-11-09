import fs from 'fs/promises';
import path from 'path';
import { keyLikeToCode } from '../src/lib/keyboard/keyMappings';

type LegacyKeystroke = {
	timestamp?: number;
	key?: string;
	text?: string;
	event_type?: 'keydown' | 'keyup' | string;
};

async function main() {
	const recordingsDir = path.resolve(process.cwd(), 'recordings');
	const entries = await fs.readdir(recordingsDir);

	const includeQt = process.argv.includes('--include-qt');
	const onlyQt = process.argv.includes('--only-qt');

	const targets = entries
		.filter((file) => file.endsWith('.json'))
		.filter((file) => {
			const isQt = file.toLowerCase().includes('qt');
			if (onlyQt) {
				return isQt;
			}
			if (!includeQt && isQt) {
				return false;
			}
			return true;
		});

	if (targets.length === 0) {
		console.log('No recordings to migrate.');
		return;
	}

	let updatedCount = 0;
	const unresolved: string[] = [];

	for (const file of targets) {
		const fullPath = path.join(recordingsDir, file);
		const raw = await fs.readFile(fullPath, 'utf-8');
		let data: Record<string, unknown>;
		try {
			data = JSON.parse(raw);
		} catch (error) {
			unresolved.push(`${file}: invalid JSON (${error})`);
			continue;
		}

		const record = data as { keystrokes?: unknown };
		const keystrokes = Array.isArray(record.keystrokes)
			? (record.keystrokes as LegacyKeystroke[])
			: null;

		if (!keystrokes) {
			continue;
		}

		let changed = false;
		let fileHasError = false;

		for (const stroke of keystrokes) {
			if (!stroke || typeof stroke !== 'object') {
				continue;
			}

			const rawKey = typeof stroke.key === 'string' ? stroke.key : undefined;
			const rawText = typeof stroke.text === 'string' ? stroke.text : undefined;
			const nextKey = keyLikeToCode(rawKey ?? rawText ?? '');

			if (!nextKey) {
				unresolved.push(`${file}: unable to map key "${rawKey ?? rawText ?? '<empty>'}"`);
				fileHasError = true;
				continue;
			}

			if (stroke.key !== nextKey) {
				stroke.key = nextKey;
				changed = true;
			}

			if ('text' in stroke) {
				delete stroke.text;
				changed = true;
			}
		}

		if (fileHasError) {
			continue;
		}

		if (changed) {
			await fs.writeFile(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
			updatedCount += 1;
		}
	}

	if (unresolved.length > 0) {
		console.error('Migration completed with unresolved keys:');
		for (const issue of unresolved) {
			console.error(` - ${issue}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(`Updated ${updatedCount} of ${targets.length} recording files.`);
}

main().catch((error) => {
	console.error('Failed to migrate keycodes:', error);
	process.exit(1);
});
