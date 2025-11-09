<script lang="ts">
	import { onMount } from "svelte";
	import RecordingTextState from "$lib/components/RecordingTextState.svelte";
	import KeyboardState from "$lib/components/KeyboardState.svelte";

	interface Recording {
		filename: string;
		recording_id: string;
		start_timestamp: number;
		end_timestamp: number;
		keyboard_session_id: string;
		control_session_id: string;
		keystrokes: Array<{
			timestamp: number;
			key: string;
			event_type: "keydown" | "keyup";
		}>;
		audio_file: string;
		deleted: boolean;
	}

	let recordings = $state<Recording[]>([]);
	let selectedRecording = $state<Recording | null>(null);
	let audioElement = $state<HTMLAudioElement | null>(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let lastLoadedRecordingId: string | null = null;

	const seekMax = $derived<number>(
		duration > 0
			? duration
			: selectedRecording
			?
				getRecordingDurationSeconds(selectedRecording)
			: 0
	);

	onMount(() => {
		loadRecordings();
	});

	function stopPlayback(clearSource = false) {
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			if (clearSource) {
				audioElement.removeAttribute("src");
				audioElement.load();
			}
		}
		isPlaying = false;
		currentTime = 0;
		lastLoadedRecordingId = null;
	}

	async function loadRecordings() {
		try {
			const response = await fetch("/api/recordings");
			if (!response.ok) {
				throw new Error("Failed to load recordings");
			}
			const data = await response.json();
			recordings = data;
			if (selectedRecording) {
				const refreshed = data.find(
					(recording: Recording) =>
						recording.recording_id ===
						selectedRecording?.recording_id,
				);
				selectedRecording = refreshed ?? null;
				if (!selectedRecording) {
					stopPlayback(true);
				}
			}
		} catch (error) {
			console.error("Error loading recordings:", error);
		}
	}

	function selectRecording(recording: Recording) {
		selectedRecording = recording;
		stopPlayback(false);
		duration = getRecordingDurationSeconds(recording);
	}

	$effect(() => {
		const player = audioElement;
		const recording = selectedRecording;

		if (!player || !recording) {
			if (!recording) {
				lastLoadedRecordingId = null;
			}
			return;
		}

		if (recording.recording_id === lastLoadedRecordingId) {
			return;
		}

		lastLoadedRecordingId = recording.recording_id;
		player.pause();
		player.src = `/recordings/${recording.audio_file}`;
		player.load();
		currentTime = 0;
		duration = getRecordingDurationSeconds(recording);
		isPlaying = false;
	});

	function togglePlayback() {
		if (!audioElement || !selectedRecording) {
			return;
		}

		if (isPlaying) {
			audioElement.pause();
		} else {
			audioElement.play();
		}
		isPlaying = !isPlaying;
	}

	function handleTimeUpdate() {
		if (audioElement) {
			currentTime = audioElement.currentTime;
		}
	}

	function handleSeekInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const newTime = Number(target.value);
		if (!Number.isFinite(newTime)) {
			return;
		}

		currentTime = newTime;
		if (audioElement) {
			audioElement.currentTime = newTime;
		}
	}

	function handleLoadedMetadata() {
		if (audioElement) {
			const mediaDuration = audioElement.duration;
			if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
				duration = mediaDuration;
			} else {
				duration = getRecordingDurationSeconds(selectedRecording);
			}
		}
	}

	function handleEnded() {
		isPlaying = false;
	}

	async function toggleRecordingDeletion(recording: Recording) {
		if (!recording.deleted) {
			const confirmed = confirm(
				`Delete recording ${recording.filename}?`,
			);
			if (!confirmed) {
				return;
			}
		}

		try {
			const response = await fetch(
				`/api/recordings/${recording.filename}`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ deleted: !recording.deleted }),
				},
			);

			if (response.ok) {
				await loadRecordings();
			} else {
				console.error("Failed to toggle recording deletion", await response.text());
			}
		} catch (error) {
			console.error("Error toggling recording deletion:", error);
		}
	}

	function getRecordingBaseName(recording: Recording) {
		return recording.filename.replace(/(_DELETED)?\.json$/, '');
	}

	async function renameRecording(recording: Recording) {
		const currentName = getRecordingBaseName(recording);
		const input = prompt(
			"Enter a new recording name (letters, numbers, '.', '_', '-')",
			currentName,
		);
		if (input === null) {
			return;
		}

		const trimmed = input.trim().replace(/\.json$/i, '');
		if (!trimmed || trimmed === currentName) {
			return;
		}

		try {
			const response = await fetch(`/api/recordings/${recording.filename}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ newBaseName: trimmed }),
			});

			if (response.ok) {
				await loadRecordings();
			} else {
				console.error("Failed to rename recording", await response.text());
			}
		} catch (error) {
			console.error("Error renaming recording:", error);
		}
	}

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString();
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	function getRecordingDurationSeconds(recording: Recording | null): number {
		if (!recording) {
			return 0;
		}

		const diff = (recording.end_timestamp - recording.start_timestamp) / 1000;
		return Number.isFinite(diff) && diff > 0 ? diff : 0;
	}
</script>

<div class="playback-container">
	<div class="header">
		<h1>Recording Playback</h1>
		<a href="/control" class="back-link">← Back to Control</a>
	</div>

	<div class="main-content">
		<div class="sidebar">
			<h2>Recordings</h2>
			<div class="recording-list">
				{#if recordings.length === 0}
					<p class="no-recordings">No recordings found</p>
				{:else}
					{#each recordings as recording (recording.filename)}
					<div
						class="recording-item"
						class:selected={selectedRecording?.filename ===
							recording.filename}
						class:deleted={recording.deleted}
						onclick={() => selectRecording(recording)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								selectRecording(recording);
							}
						}}
						role="button"
						tabindex="0"
					>
					<div class="recording-info">
						<span class="recording-name">{getRecordingBaseName(recording)}</span>
						<div class="recording-meta">
							<span>{formatTimestamp(recording.start_timestamp)}</span>
							<span>•</span>
							<span>
								{formatDuration(
									(recording.end_timestamp - recording.start_timestamp) /
										1000,
									)}
							</span>
						</div>
						{#if recording.deleted}
							<span class="recording-badge">Deleted</span>
						{/if}
					</div>
					<div class="recording-actions">
						<button
							class="icon-button"
							onclick={(e) => {
								e.stopPropagation();
								renameRecording(recording);
							}}
							type="button"
							title="Rename recording"
						>
							<span aria-hidden="true">✏️</span>
							<span class="sr-only">Rename recording</span>
						</button>
						<button
							class="icon-button"
							class:restore={recording.deleted}
							onclick={(e) => {
								e.stopPropagation();
								toggleRecordingDeletion(recording);
							}}
							type="button"
							title={recording.deleted ? 'Restore recording' : 'Delete recording'}
						>
							<span aria-hidden="true">{recording.deleted ? "↺" : "🗑"}</span>
							<span class="sr-only">
								{recording.deleted ? "Restore recording" : "Delete recording"}
							</span>
						</button>
					</div>
				</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="player-section">
			{#if selectedRecording}
				<div class="player">
					<h2>Now Playing</h2>
					<div class="player-info">
						<p class="player-name">{getRecordingBaseName(selectedRecording)}</p>
						<p class="player-meta">
							{formatTimestamp(selectedRecording.start_timestamp)} •
							{formatDuration(
								(selectedRecording.end_timestamp - selectedRecording.start_timestamp) /
									1000,
							)}
						</p>
						<p>Keystrokes: {selectedRecording.keystrokes.length}</p>
					</div>

					{#if selectedRecording.deleted}
						<p class="deleted-warning">
							This recording is soft-deleted. You can still play it, or restore it to mark it active again.
						</p>
					{/if}

					<audio
						bind:this={audioElement}
						ontimeupdate={handleTimeUpdate}
						onloadedmetadata={handleLoadedMetadata}
						onended={handleEnded}
					></audio>

					<div class="controls">
						<button
							class="play-button"
							onclick={togglePlayback}
						>
							{isPlaying ? "⏸ Pause" : "▶ Play"}
						</button>
						<input
							type="range"
							class="seekbar"
							min="0"
							max={seekMax || 0}
							step="0.01"
							value={Math.min(currentTime, seekMax || 0)}
							oninput={handleSeekInput}
							disabled={seekMax === 0}
						/>
						<div class="time-display">
							{formatDuration(currentTime)} / {formatDuration(
								duration,
							)}
						</div>
					</div>

					<div class="state-panels">
						<RecordingTextState
							recording={selectedRecording}
							{currentTime}
						/>
						<KeyboardState
							recording={selectedRecording}
							{currentTime}
						/>
					</div>
				</div>
			{:else}
				<div class="no-selection">
					<p>Select a recording to play</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.playback-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #0a0a0a;
		color: #00ff00;
		font-family: monospace;
	}

	.header {
		padding: 1rem 2rem;
		background: #000000;
		border-bottom: 1px solid #003300;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: normal;
	}

	.back-link {
		color: #00ff00;
		text-decoration: none;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	.main-content {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.sidebar {
		width: 20rem;
		background: #000000;
		border-right: 1px solid #003300;
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	.sidebar h2 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: normal;
	}

	.recording-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.no-recordings {
		color: #00aa00;
		font-size: 0.875rem;
	}

	.recording-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: #0a0a0a;
		border: 1px solid #003300;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.2s;
		color: #00ff00;
		font-family: monospace;
		text-align: left;
	}

	.recording-item.deleted {
		opacity: 0.65;
		border-color: #332200;
	}

	.recording-item:hover {
		background: #001100;
		border-color: #00aa00;
	}

	.recording-item.selected {
		background: #001a00;
		border-color: #00ff00;
	}

	.recording-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.recording-name {
		font-size: 1rem;
		color: #00ff99;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recording-meta {
		display: flex;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: #00aa00;
	}

	.recording-meta span {
		line-height: 1.2;
	}

	.recording-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-left: 0.75rem;
		align-items: center;
	}

	.recording-badge {
		margin-top: 0.25rem;
		padding: 0.1rem 0.4rem;
		font-size: 0.65rem;
		border: 1px solid #553300;
		border-radius: 0.25rem;
		background: #331100;
		color: #ffcc00;
		align-self: flex-start;
	}

	.icon-button {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid #003300;
		background: #001100;
		color: #00ddff;
		cursor: pointer;
		font-size: 0.9rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.2s, transform 0.2s;
	}

	.icon-button.restore {
		color: #33ff88;
	}

	.icon-button:hover {
		border-color: #00ff99;
		transform: scale(1.05);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		border: 0;
	}

	.player-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 2rem;
	}

	.no-selection {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #00aa00;
	}

	.player {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.player h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: normal;
	}

		.player-info {
			background: #000000;
			border: 1px solid #003300;
			padding: 1rem;
			border-radius: 0.25rem;
		}

		.player-info p {
			margin: 0.35rem 0;
			font-size: 0.85rem;
			color: #00aa00;
		}

		.player-name {
			font-size: 1.1rem;
			color: #00ff99;
		}

		.player-meta {
			font-size: 0.8rem;
			color: #00aa00;
		}

	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: #000000;
		border: 1px solid #003300;
		border-radius: 0.25rem;
	}

	.play-button {
		padding: 0.75rem 1.5rem;
		background: #003300;
		color: #00ff00;
		border: 1px solid #00aa00;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.play-button:hover {
		background: #004400;
		border-color: #00ff00;
	}

	.seekbar {
		flex: 1;
		appearance: none;
		height: 0.35rem;
		background: #001500;
		border-radius: 0.25rem;
		outline: none;
	}

	.seekbar:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.seekbar::-webkit-slider-thumb {
		appearance: none;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 50%;
		background: #00ff99;
		cursor: pointer;
	}

	.seekbar::-moz-range-thumb {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 50%;
		background: #00ff99;
		border: none;
		cursor: pointer;
	}


	.time-display {
		color: #00aa00;
		font-size: 0.875rem;
	}

	.state-panels {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.25rem;
	}

	audio {
		display: none;
	}

	.deleted-warning {
		margin: 0;
		padding: 0.75rem 1rem;
		background: #331100;
		border: 1px solid #553300;
		border-radius: 0.25rem;
		color: #ffcc00;
		font-size: 0.85rem;
	}
</style>
