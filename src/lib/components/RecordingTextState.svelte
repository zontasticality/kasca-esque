<script lang="ts">
	import { TextTimeline, type KeystrokeEvent, type TextSnapshot } from "$lib/text/textTimeline";

const timelineCache = new Map<string, TextTimeline>();

	type RecordingLike = {
		start_timestamp: number;
		end_timestamp: number;
		keystrokes: KeystrokeEvent[];
		filename?: string;
	};

	const props = $props<{
		recording: RecordingLike | null;
		currentTime: number;
	}>();

	let timeline = $state<TextTimeline | null>(null);
	let lastRecordingKey = $state<string | null>(null);

	$effect(() => {
		const rec = props.recording;
		const key = rec ? rec.filename ?? `${rec.start_timestamp}-${rec.end_timestamp}` : null;

		if (!rec || !rec.keystrokes?.length) {
			lastRecordingKey = null;
			timeline = null;
			return;
		}

		if (key !== lastRecordingKey) {
			timeline = getOrCreateTimeline(rec);
			lastRecordingKey = key;
		}
	});

	const emptySnapshot: TextSnapshot = { text: "", cursor: 0 };

	const textSnapshot = $derived<TextSnapshot>(
		resolveSnapshot(props.recording, timeline, props.currentTime, emptySnapshot)
	);

	const renderedHtml = $derived(buildRenderedHtml(textSnapshot));

	function resolveSnapshot(
		rec: RecordingLike | null,
		timeline: TextTimeline | null,
		currentTime: number,
		fallback: TextSnapshot
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
		const before = formatSegment(snapshot.text.slice(0, snapshot.cursor));
		const after = formatSegment(snapshot.text.slice(snapshot.cursor));
		return `${before}<span class="text-cursor"></span>${after}`;
	}

	function getOrCreateTimeline(rec: RecordingLike) {
		const cacheKey = rec.filename ?? `${rec.start_timestamp}-${rec.end_timestamp}`;
		const cached = timelineCache.get(cacheKey);
		if (cached) {
			return cached;
		}
		const timeline = new TextTimeline(rec.keystrokes);
		timelineCache.set(cacheKey, timeline);
		return timeline;
	}

	function formatSegment(segment: string) {
		return escapeHtml(segment).replace(/\t/g, '    ');
	}

	function escapeHtml(value: string) {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
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
		background: #000000;
		border: 1px solid #003300;
		border-radius: 0.25rem;
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
		color: #00ff99;
	}

	.text-state-meta {
		font-size: 0.8rem;
		color: #00aa00;
	}

	.text-state-body {
		min-height: 6rem;
		max-height: 16rem;
		overflow-y: auto;
		background: #050505;
		border: 1px solid #002200;
		border-radius: 0.25rem;
		padding: 0.75rem;
	}

	pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.9rem;
		color: #00ff00;
		min-height: 0;
		line-height: 1.3;
	}

	pre.empty {
		color: #006600;
	}

	:global(.text-cursor) {
		display: inline-block;
		width: 2px;
		height: 1.1em;
		background: #00ff99;
		margin: 0 1px;
		animation: cursor-blink 1s steps(2, start) infinite;
		vertical-align: bottom;
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
		color: #006600;
	}
</style>
