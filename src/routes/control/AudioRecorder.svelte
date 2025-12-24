<script lang="ts">
	import { onMount } from "svelte";
	import {
		acquireMediaStream,
		releaseMediaStream,
	} from "$lib/utils/mediaStream";

	interface Props {
		isRecording: boolean;
		onstart: (recordingId: string) => void;
		onstop: () => void;
		onaudiochunk: (chunk: ArrayBuffer) => void;
		onserverready?: () => void;
	}

	let { isRecording, onstart, onstop, onaudiochunk, onserverready }: Props =
		$props();

	let mediaRecorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let hasPermission = $state(false);
	let permissionError = $state<string | null>(null);

	// Promise chain ensures chunks are sent in order
	let sendQueue: Promise<void> = Promise.resolve();
	let stopPending = false;
	let pendingRecordingId: string | null = null;

	onMount(() => {
		requestMicrophonePermission();

		return () => {
			releaseMediaStream();
		};
	});

	async function requestMicrophonePermission() {
		try {
			stream = await acquireMediaStream();
			hasPermission = true;
			permissionError = null;
		} catch (error) {
			console.error("Microphone permission denied:", error);
			permissionError = "Microphone access denied";
			hasPermission = false;
		}
	}

	// Called by parent when server confirms recording started
	export function notifyServerReady() {
		if (!pendingRecordingId || !mediaRecorder) {
			console.warn("notifyServerReady called but no pending recording");
			return;
		}

		// NOW start the MediaRecorder - server is ready to receive
		mediaRecorder.start(500); // Emit chunks every 500ms
		console.log("MediaRecorder started after server confirmation");

		if (onserverready) {
			onserverready();
		}
	}

	function toggleRecording() {
		if (isRecording) {
			stopRecording();
		} else {
			startRecording();
		}
	}

	function startRecording() {
		if (!stream || !hasPermission) {
			alert("Microphone access is required");
			return;
		}

		const recordingId = crypto.randomUUID();
		pendingRecordingId = recordingId;

		// Reset state
		sendQueue = Promise.resolve();
		stopPending = false;

		// Create MediaRecorder with WebM format
		try {
			mediaRecorder = new MediaRecorder(stream, {
				mimeType: "audio/webm",
			});
		} catch (error) {
			console.error("Failed to create MediaRecorder:", error);
			alert("Failed to start recording");
			pendingRecordingId = null;
			return;
		}

		mediaRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				const blob = event.data;

				// Chain each conversion to ensure in-order sending
				sendQueue = sendQueue
					.then(async () => {
						const buffer = await blob.arrayBuffer();
						onaudiochunk(buffer);
					})
					.catch((error) => {
						console.error("Error processing audio chunk:", error);
					});
			}
		};

		mediaRecorder.addEventListener("stop", () => {
			// Wait for all pending chunks to be sent before signaling stop
			sendQueue.then(() => {
				finishStop();
			});
		});

		// Notify parent to send start_recording message
		// MediaRecorder will be started when notifyServerReady() is called
		onstart(recordingId);
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== "inactive") {
			stopPending = true;
			mediaRecorder.stop();
			return;
		}

		// If recorder was never started, still reset state and signal parent
		finishStop();
	}

	function finishStop() {
		sendQueue = Promise.resolve();
		stopPending = false;
		pendingRecordingId = null;
		mediaRecorder = null;
		onstop();
	}
</script>

<div class="audio-recorder">
	<h2>Recording Controls</h2>

	{#if permissionError}
		<p class="error">{permissionError}</p>
		<button onclick={requestMicrophonePermission} class="retry-button">
			Retry Microphone Access
		</button>
	{:else if !hasPermission}
		<p class="info">Requesting microphone access...</p>
	{:else}
		<button
			onclick={toggleRecording}
			class="record-button"
			class:recording={isRecording}
		>
			{isRecording ? "Stop Recording" : "Start Recording"}
		</button>

		{#if isRecording}
			<div class="recording-indicator">
				<span class="pulse"></span>
				<span class="text">RECORDING</span>
			</div>
		{/if}
	{/if}
</div>

<style>
	.audio-recorder {
		background: var(--panel-bg);
		border: var(--panel-border);
		padding: var(--panel-padding);
		border-radius: var(--panel-radius);
	}

	h2 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: normal;
		color: var(--text-primary);
	}

	.error {
		color: var(--error);
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
	}

	.info {
		color: var(--text-secondary);
		margin: 0;
		font-size: 0.875rem;
	}

	.record-button {
		width: 100%;
		padding: 1rem;
		background: var(--border-primary);
		color: var(--text-primary);
		border: 1px solid var(--text-secondary);
		border-radius: var(--panel-radius);
		font-family: var(--font-mono);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.record-button:hover {
		background: #004400;
		border-color: var(--text-primary);
	}

	.record-button.recording {
		background: #440000;
		color: var(--error);
		border-color: var(--error);
	}

	.record-button.recording:hover {
		background: #550000;
	}

	.retry-button {
		padding: 0.75rem 1.5rem;
		background: var(--border-primary);
		color: var(--text-primary);
		border: 1px solid var(--text-secondary);
		border-radius: var(--panel-radius);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: #004400;
		border-color: var(--text-primary);
	}

	.recording-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.75rem;
		background: var(--bg-secondary);
		border: 1px solid var(--error);
		border-radius: var(--panel-radius);
	}

	.pulse {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: var(--error);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			box-shadow: 0 0 0.5rem var(--error);
		}
		50% {
			opacity: 0.5;
			box-shadow: 0 0 1rem var(--error);
		}
	}

	.text {
		color: var(--error);
		font-size: 0.875rem;
		font-weight: bold;
	}
</style>
