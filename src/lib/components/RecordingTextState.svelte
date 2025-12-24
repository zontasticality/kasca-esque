<script lang="ts">
	import {
		TextTimeline,
		type KeystrokeEvent,
		type TextSnapshot,
	} from "$lib/text/textTimeline";
	import type { RecordingLike } from "$lib/types";

	const timelineCache = new Map<string, TextTimeline>();

	const props = $props<{
		recording: RecordingLike | null;
		currentTime: number;
	}>();

	let timeline = $state<TextTimeline | null>(null);
	let lastRecordingKey = $state<string | null>(null);

	$effect(() => {
		const rec = props.recording;
		const key = rec
			? (rec.filename ?? `${rec.start_timestamp}-${rec.end_timestamp}`)
			: null;

		// Use allEvents if available (includes mousedown, select, etc), otherwise fall back to keystrokes
		const events = rec?.allEvents ?? rec?.keystrokes;

		if (!rec || !events?.length) {
			lastRecordingKey = null;
			timeline = null;
			return;
		}

		if (key !== lastRecordingKey) {
			timeline = getOrCreateTimeline(rec, events);
			lastRecordingKey = key;
		}
	});

	const emptySnapshot: TextSnapshot = { text: "", cursor: 0 };

	const textSnapshot = $derived<TextSnapshot>(
		resolveSnapshot(
			props.recording,
			timeline,
			props.currentTime,
			emptySnapshot,
		),
	);

	const renderedHtml = $derived(buildRenderedHtml(textSnapshot));

	function resolveSnapshot(
		rec: RecordingLike | null,
		timeline: TextTimeline | null,
		currentTime: number,
		fallback: TextSnapshot,
	): TextSnapshot {
		if (!rec || !timeline) {
			return fallback;
		}

		const referenceStart = Number.isFinite(rec.start_timestamp)
			? rec.start_timestamp
			: timeline.baseTime;
		const absoluteTime = referenceStart + currentTime * 1000;
		return timeline.getStateAt(absoluteTime);
	}

	function buildRenderedHtml(snapshot: TextSnapshot) {
		const text = snapshot.text;
		const cursor = snapshot.cursor;
		const selStart = snapshot.selectionStart ?? cursor;
		const selEnd = snapshot.selectionEnd ?? cursor;

		// Determine if there's an active selection
		const hasSelection = selStart !== selEnd;

		if (hasSelection) {
			// Render with selection highlight
			const beforeSel = formatSegment(
				text.slice(0, Math.min(selStart, selEnd)),
			);
			const selected = formatSegment(
				text.slice(
					Math.min(selStart, selEnd),
					Math.max(selStart, selEnd),
				),
			);
			const afterSel = formatSegment(
				text.slice(Math.max(selStart, selEnd)),
			);

			// Cursor is at the end of selection
			return `${beforeSel}<span class="text-selection">${selected}</span><span class="text-cursor"></span>${afterSel}`;
		} else {
			// No selection, just show cursor
			const before = formatSegment(text.slice(0, cursor));
			const after = formatSegment(text.slice(cursor));
			return `${before}<span class="text-cursor"></span>${after}`;
		}
	}

	function getOrCreateTimeline(rec: RecordingLike, events: unknown[]) {
		const cacheKey =
			rec.filename ?? `${rec.start_timestamp}-${rec.end_timestamp}`;
		const cached = timelineCache.get(cacheKey);
		if (cached) {
			return cached;
		}
		// Pass events directly to TextTimeline - it handles both old and new formats
		const timeline = new TextTimeline(events as any);
		timelineCache.set(cacheKey, timeline);
		return timeline;
	}

	function formatSegment(segment: string) {
		return escapeHtml(segment).replace(/\t/g, "    ");
	}

	function escapeHtml(value: string) {
		return value
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}
</script>

<div class="text-state-panel">
	<div class="text-state-header">
		<h3>Text Snapshot</h3>
		<span class="text-state-meta">
			{props.recording
				? `Showing state at ${props.currentTime.toFixed(1)}s`
				: "No recording selected"}
		</span>
	</div>
	<div class="text-state-body">
		{#if props.recording && timeline}
			<pre class:empty={!textSnapshot.text.length}>
				{@html renderedHtml}
			</pre>
		{:else}
			<p class="text-state-empty">No text recorded yet.</p>
		{/if}
	</div>
</div>

<style>
	.text-state-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--panel-bg);
		border: var(--panel-border);
		border-radius: var(--panel-radius);
		padding: 1rem;
	}

	.text-state-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}

	.text-state-header h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--accent);
	}

	.text-state-meta {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.text-state-body {
		min-height: 6rem;
		max-height: 16rem;
		overflow-y: auto;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-secondary);
		border-radius: var(--panel-radius);
		padding: 0.75rem;
	}

	pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.9rem;
		color: var(--text-primary);
		min-height: 0;
		line-height: 1.3;
	}

	pre.empty {
		color: var(--text-muted);
	}

	:global(.text-cursor) {
		display: inline-block;
		width: 2px;
		height: 1.1em;
		background: var(--accent);
		margin: 0 1px;
		animation: cursor-blink 1s steps(2, start) infinite;
		vertical-align: bottom;
	}

	:global(.text-selection) {
		background: rgba(0, 100, 255, 0.4);
		color: #ffffff;
		border-radius: 2px;
	}

	@keyframes cursor-blink {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	.text-state-empty {
		margin: 0;
		color: var(--text-muted);
	}
</style>
