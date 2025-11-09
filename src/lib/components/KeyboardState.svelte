<script lang="ts">
	import type { KeystrokeEvent } from "$lib/text/textTimeline";
	import {
		buildKeyTimeline,
		type KeySnapshot,
		normalizeKeyValue
	} from "$lib/text/keyState";

	type RecordingLike = {
		start_timestamp: number;
		keystrokes: KeystrokeEvent[];
		filename?: string;
	};

	const props = $props<{
		recording: RecordingLike | null;
		currentTime: number;
	}>();

	let timeline = $state<ReturnType<typeof buildKeyTimeline> | null>(null);
	let lastRecordingKey = $state<string | null>(null);

	$effect(() => {
		const rec = props.recording;
		const key = rec ? rec.filename ?? rec.start_timestamp.toString() : null;

		if (!rec || !rec.keystrokes?.length) {
			lastRecordingKey = null;
			timeline = null;
			return;
		}

		if (key !== lastRecordingKey) {
			timeline = buildKeyTimeline(rec.keystrokes);
			lastRecordingKey = key;
		}
	});

	const snapshot = $derived<KeySnapshot>(
		resolveKeySnapshot(props.recording, timeline, props.currentTime)
	);

	const layout = [
		{
			row: 1,
			keys: [
				{ label: 'Esc', width: 2 },
				{ label: 'F1', width: 2 },
				{ label: 'F2', width: 2 },
				{ label: 'F3', width: 2 },
				{ label: 'F4', width: 2 },
				{ label: 'F5', width: 2 },
				{ label: 'F6', width: 2 },
				{ label: 'F7', width: 2 },
				{ label: 'F8', width: 2 },
				{ label: 'F9', width: 2 },
				{ label: 'F10', width: 2 },
				{ label: 'F11', width: 2 },
				{ label: 'F12', width: 2 }
			]
		},
		{
			row: 2,
			keys: [
				{ label: '`', width: 2 },
				{ label: '1', width: 2 },
				{ label: '2', width: 2 },
				{ label: '3', width: 2 },
				{ label: '4', width: 2 },
				{ label: '5', width: 2 },
				{ label: '6', width: 2 },
				{ label: '7', width: 2 },
				{ label: '8', width: 2 },
				{ label: '9', width: 2 },
				{ label: '0', width: 2 },
				{ label: '-', width: 2 },
				{ label: '=', width: 2 },
				{ label: 'Backspace', width: 4 }
			]
		},
		{
			row: 3,
			keys: [
				{ label: 'Tab', width: 3 },
				{ label: 'Q', width: 2 },
				{ label: 'W', width: 2 },
				{ label: 'E', width: 2 },
				{ label: 'R', width: 2 },
				{ label: 'T', width: 2 },
				{ label: 'Y', width: 2 },
				{ label: 'U', width: 2 },
				{ label: 'I', width: 2 },
				{ label: 'O', width: 2 },
				{ label: 'P', width: 2 },
				{ label: '[', width: 2 },
				{ label: ']', width: 2 },
				{ label: '\\', width: 3 }
			]
		},
		{
			row: 4,
			keys: [
				{ label: 'CapsLock', width: 4 },
				{ label: 'A', width: 2 },
				{ label: 'S', width: 2 },
				{ label: 'D', width: 2 },
				{ label: 'F', width: 2 },
				{ label: 'G', width: 2 },
				{ label: 'H', width: 2 },
				{ label: 'J', width: 2 },
				{ label: 'K', width: 2 },
				{ label: 'L', width: 2 },
				{ label: ';', width: 2 },
				{ label: "'", width: 2 },
				{ label: 'Enter', width: 4 }
			]
		},
		{
			row: 5,
			keys: [
				{ label: 'Shift', width: 5 },
				{ label: 'Z', width: 2 },
				{ label: 'X', width: 2 },
				{ label: 'C', width: 2 },
				{ label: 'V', width: 2 },
				{ label: 'B', width: 2 },
				{ label: 'N', width: 2 },
				{ label: 'M', width: 2 },
				{ label: ',', width: 2 },
				{ label: '.', width: 2 },
				{ label: '/', width: 2 },
				{ label: 'Shift', width: 5 }
			]
		},
		{
			row: 6,
			keys: [
				{ label: 'Ctrl', width: 3 },
				{ label: 'Meta', width: 3 },
				{ label: 'Alt', width: 3 },
				{ label: 'Space', width: 12 },
				{ label: 'Alt', width: 3 },
				{ label: 'Meta', width: 3 },
				{ label: 'Menu', width: 3 },
				{ label: 'Ctrl', width: 3 }
			]
		}
	];

	const totalColumns = Math.max(
		...layout.map((row) => row.keys.reduce((sum, key) => sum + key.width, 0))
	);
	const rowCount = layout.length;

	function isPressed(label: string) {
		return snapshot.pressed.has(labelToKey(label));
	}

	function resolveKeySnapshot(
		rec: RecordingLike | null,
		timeline: ReturnType<typeof buildKeyTimeline> | null,
		currentTime: number
	): KeySnapshot {
		if (!rec || !timeline) {
			return { pressed: new Set() };
		}

		const referenceStart = Number.isFinite(rec.start_timestamp)
			? rec.start_timestamp
			: timeline.baseTime;
		return timeline.getStateAt(referenceStart + currentTime * 1000);
	}

	function labelToKey(label: string) {
		if (label === "Space") {
			return normalizeKeyValue(" ");
		}
		if (label === "Ctrl") {
			return normalizeKeyValue("Control");
		}
		if (label === "Menu") {
			return normalizeKeyValue("ContextMenu");
		}
		return normalizeKeyValue(label);
	}
</script>

<div class="keyboard-state">
	{#if timeline}
		<div
			class="keyboard-grid"
			style={`--columns:${totalColumns}; --rows:${rowCount};`}
		>
			{#each layout as row (row.row)}
				{#each row.keys as key (`${row.row}-${key.label}-${key.width}`)}
					<span
						class="key"
						class:pressed={isPressed(key.label)}
						style={`grid-column: span ${key.width}; grid-row: ${row.row};`}
					>
						{key.label === ' ' ? 'Space' : key.label}
					</span>
				{/each}
			{/each}
		</div>
	{:else}
		<p class="keyboard-empty">No key data</p>
	{/if}
</div>

<style>
	.keyboard-state {
		width: 100%;
		max-width: 48rem;
		align-self: center;
	}

	.keyboard-grid {
		position: relative;
		width: 100%;
		aspect-ratio: calc(var(--columns) / (var(--rows) * 1.05));
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		grid-template-rows: repeat(var(--rows), 1fr);
		gap: clamp(0.2rem, 1vw, 0.4rem);
		padding: clamp(0.4rem, 1.5vw, 0.75rem);
		border: 1px solid #003300;
		border-radius: 0.5rem;
		background: #020202;
	}

	.key {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #003300;
		border-radius: 0.35rem;
		background: #050505;
		color: #00aa00;
		font-size: clamp(0.6rem, 1vw, 0.85rem);
	}

	.key.pressed {
		background: #00aa00;
		color: #000000;
		border-color: #00ff99;
	}

	.keyboard-empty {
		color: #006600;
	}
</style>
