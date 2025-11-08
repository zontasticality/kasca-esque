<script lang="ts">
	import { onMount } from "svelte";

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
	}

	interface KeystrokeDisplay {
		key: string;
		timestamp: number;
		opacity: number;
	}

	let recordings = $state<Recording[]>([]);
	let selectedRecording = $state<Recording | null>(null);
	let audioElement: HTMLAudioElement;
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let displayedKeystrokes = $state<KeystrokeDisplay[]>([]);
	let animationId: number | null = null;

	onMount(() => {
		loadRecordings();

		return () => {
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
			}
		};
	});

	async function loadRecordings() {
		try {
			const response = await fetch("/api/recordings");
			recordings = await response.json();
		} catch (error) {
			console.error("Error loading recordings:", error);
		}
	}

	function selectRecording(recording: Recording) {
		selectedRecording = recording;
		displayedKeystrokes = [];
		currentTime = 0;
		isPlaying = false;

		if (audioElement) {
			audioElement.src = `/recordings/${recording.audio_file}`;
		}
	}

	function togglePlayback() {
		if (!audioElement || !selectedRecording) return;

		if (isPlaying) {
			audioElement.pause();
		} else {
			audioElement.play();
			updateKeystrokeDisplay();
		}
		isPlaying = !isPlaying;
	}

	function updateKeystrokeDisplay() {
		if (!selectedRecording || !isPlaying) return;

		animationId = requestAnimationFrame(updateKeystrokeDisplay);

		const playbackTimestamp =
			selectedRecording.start_timestamp + currentTime * 1000;

		// Find keystrokes that should be visible
		const relevantKeystrokes = selectedRecording.keystrokes.filter(
			(ks) =>
				ks.event_type === "keydown" &&
				ks.timestamp <= playbackTimestamp,
		);

		// Update displayed keystrokes with fading effect
		displayedKeystrokes = relevantKeystrokes.slice(-20).map((ks) => {
			const age = (playbackTimestamp - ks.timestamp) / 1000; // age in seconds
			const opacity = Math.max(0, 1 - age / 3); // fade over 3 seconds
			return {
				key: ks.key,
				timestamp: ks.timestamp,
				opacity,
			};
		});
	}

	function handleTimeUpdate() {
		if (audioElement) {
			currentTime = audioElement.currentTime;
		}
	}

	function handleLoadedMetadata() {
		console.log("updating metadata");
		if (audioElement) {
			duration = audioElement.duration;
			console.log("new duration:", duration);
			console.log("audio", audioElement);
		}
	}

	function handleEnded() {
		isPlaying = false;
		displayedKeystrokes = [];
	}

	async function deleteRecording(recording: Recording) {
		if (!confirm(`Delete recording ${recording.filename}?`)) {
			return;
		}

		try {
			const response = await fetch(
				`/api/recordings/${recording.filename}`,
				{
					method: "DELETE",
				},
			);

			if (response.ok) {
				await loadRecordings();
				if (selectedRecording?.filename === recording.filename) {
					selectedRecording = null;
					displayedKeystrokes = [];
				}
			}
		} catch (error) {
			console.error("Error deleting recording:", error);
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
							onclick={() => selectRecording(recording)}
							role="button"
							tabindex="0"
						>
							<div class="recording-info">
								<span class="recording-date"
									>{formatTimestamp(
										recording.start_timestamp,
									)}</span
								>
								<span class="recording-duration">
									{formatDuration(
										(recording.end_timestamp -
											recording.start_timestamp) /
											1000,
									)}
								</span>
							</div>
							<button
								class="delete-button"
								onclick={(e) => {
									e.stopPropagation();
									deleteRecording(recording);
								}}
							>
								×
							</button>
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
						<p>
							Recording ID: {selectedRecording.recording_id.slice(
								0,
								8,
							)}
						</p>
						<p>
							Keyboard Session: {selectedRecording.keyboard_session_id.slice(
								0,
								8,
							)}
						</p>
						<p>Keystrokes: {selectedRecording.keystrokes.length}</p>
					</div>

					<audio
						bind:this={audioElement}
						ontimeupdate={handleTimeUpdate}
						onloadedmetadata={handleLoadedMetadata}
						onended={handleEnded}
					></audio>

					<div class="controls">
						<button class="play-button" onclick={togglePlayback}>
							{isPlaying ? "⏸ Pause" : "▶ Play"}
						</button>
						<div class="time-display">
							{formatDuration(currentTime)} / {formatDuration(
								duration,
							)}
						</div>
					</div>

					<div class="keystroke-display">
						<h3>Keystrokes</h3>
						<div class="keystroke-list">
							{#each displayedKeystrokes as keystroke (keystroke.timestamp)}
								<span
									class="keystroke-item"
									style="opacity: {keystroke.opacity}"
								>
									{keystroke.key === " "
										? "␣"
										: keystroke.key}
								</span>
							{/each}
						</div>
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

	.recording-item:hover {
		background: #001100;
		border-color: #00aa00;
	}

	.recording-item.selected {
		background: #001a00;
		border-color: #00ff00;
	}

	.recording-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.recording-date {
		font-size: 0.875rem;
	}

	.recording-duration {
		font-size: 0.75rem;
		color: #00aa00;
	}

	.delete-button {
		width: 1.5rem;
		height: 1.5rem;
		background: #330000;
		border: 1px solid #aa0000;
		border-radius: 0.25rem;
		color: #ff3333;
		font-size: 1.25rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		line-height: 1;
	}

	.delete-button:hover {
		background: #440000;
		border-color: #ff3333;
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
		margin: 0.5rem 0;
		font-size: 0.875rem;
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

	.time-display {
		color: #00aa00;
		font-size: 0.875rem;
	}

	.keystroke-display {
		flex: 1;
		background: #000000;
		border: 1px solid #003300;
		border-radius: 0.25rem;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.keystroke-display h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		font-weight: normal;
	}

	.keystroke-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
	}

	.keystroke-item {
		padding: 0.5rem;
		background: #0a0a0a;
		border: 1px solid #003300;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		transition: opacity 0.3s;
	}

	audio {
		display: none;
	}
</style>
