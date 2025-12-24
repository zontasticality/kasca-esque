<script lang="ts">
	import { buildKeyTimeline, type KeySnapshot } from "$lib/text/keyState";
	import {
		keyboardLayout,
		totalColumns,
		rowCount,
		aspectRatio,
		knownKeyValues,
		type KeyCell,
	} from "$lib/keyboard/keyboardLayout";
	import type { RecordingLike } from "$lib/types";

	const props = $props<{
		recording: RecordingLike | null;
		currentTime: number;
	}>();

	let timeline = $state<ReturnType<typeof buildKeyTimeline> | null>(null);
	let lastRecordingKey = $state<string | null>(null);

	$effect(() => {
		const rec = props.recording;
		const key = rec
			? (rec.filename ?? rec.start_timestamp.toString())
			: null;

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
		resolveKeySnapshot(props.recording, timeline, props.currentTime),
	);

	function isPressedValue(value: string) {
		return snapshot.pressed.has(value);
	}

	let unmatchedPressed = $state<string[]>([]);

	$effect(() => {
		if (!snapshot.pressed || snapshot.pressed.size === 0) {
			unmatchedPressed = [];
			return;
		}
		unmatchedPressed = [...snapshot.pressed].filter(
			(value) => !knownKeyValues.has(value),
		);
	});

	function resolveKeySnapshot(
		rec: RecordingLike | null,
		timeline: ReturnType<typeof buildKeyTimeline> | null,
		currentTime: number,
	): KeySnapshot {
		if (!rec || !timeline) {
			return { pressed: new Set() };
		}

		const referenceStart = Number.isFinite(rec.start_timestamp)
			? rec.start_timestamp
			: timeline.baseTime;
		return timeline.getStateAt(referenceStart + currentTime * 1000);
	}
</script>

<div class="keyboard-state">
	{#if timeline}
		<div
			class="keyboard-shell"
			style={`--columns:${totalColumns}; --rows:${rowCount}; --aspect:${aspectRatio};`}
		>
			<div
				class="keyboard-grid"
				style={`--columns:${totalColumns}; --rows:${rowCount};`}
			>
				{#each keyboardLayout as row (row.row)}
					{#each row.cells as cell, idx}
						{#if cell.kind === "key"}
							<span
								class={`key ${(cell as KeyCell).classes?.join(" ") ?? ""}`}
								class:pressed={isPressedValue(
									(cell as KeyCell).value,
								)}
								style={`grid-column: span ${cell.width}; grid-row: ${row.row} / span ${cell.rowSpan ?? 1};`}
							>
								{(cell as KeyCell).label}
							</span>
						{:else}
							<span
								class="key spacer"
								aria-hidden="true"
								style={`grid-column: span ${cell.width}; grid-row: ${row.row} / span ${cell.rowSpan ?? 1};`}
							></span>
						{/if}
					{/each}
				{/each}
			</div>
		</div>

		{#if unmatchedPressed.length}
			<div class="unknown-keys">
				<p>Other active keys: {unmatchedPressed.join(", ")}</p>
			</div>
		{/if}
	{:else}
		<p class="keyboard-empty">No key data</p>
	{/if}
</div>

<style>
	.keyboard-state {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.keyboard-shell {
		width: 100%;
		aspect-ratio: var(--aspect);
		border: 1px solid var(--border-primary, #003300);
		border-radius: 0.35rem;
		background: var(--bg-tertiary, #020202);
		padding: clamp(0.3rem, 0.9vw, 0.7rem);
		box-sizing: border-box;
		margin: 0 auto;
	}

	.keyboard-grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
		gap: clamp(0.04rem, 0.25vw, 0.15rem);
		height: 100%;
	}

	.key {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #003000;
		border-radius: 0.18rem;
		background: var(--bg-tertiary, #050505);
		color: var(--text-secondary, #00aa00);
		font-size: clamp(0.38rem, 0.65vw, 0.55rem);
		padding: 0.03rem;
		line-height: 1.08;
		text-align: center;
	}

	.key.pressed {
		background: var(--text-secondary, #00aa00);
		color: var(--bg-primary, #000000);
		border-color: var(--accent, #00ff99);
	}

	.key.spacer {
		border: none;
		background: transparent;
		pointer-events: none;
	}

	.key.numpad {
		background: #041004;
		color: #8cff8c;
	}

	.key.numpad.pressed {
		background: #3dff6f;
		color: #011400;
	}

	.key.nav,
	.key.arrow {
		background: #031503;
	}

	.unknown-keys {
		width: min(100%, 60rem);
		font-size: 0.75rem;
		color: var(--text-secondary, #00aa00);
	}

	.keyboard-empty {
		color: var(--text-muted, #006600);
	}
</style>
