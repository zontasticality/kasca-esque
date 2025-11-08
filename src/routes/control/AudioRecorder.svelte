<script lang="ts">
	import { onMount } from "svelte";

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
	let chunkBuffer: ArrayBuffer[] = [];
	let isServerReady = $state(false);
	let stopPending = false;
	let recorderStopped = false;
	let pendingChunkConversions = 0;

	onMount(() => {
		requestMicrophonePermission();

		return () => {
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}
		};
	});

	async function requestMicrophonePermission() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			hasPermission = true;
			permissionError = null;
		} catch (error) {
			console.error("Microphone permission denied:", error);
			permissionError = "Microphone access denied";
			hasPermission = false;
		}
	}

	export function notifyServerReady() {
		isServerReady = true;
		flushChunkBuffer();
		if (onserverready) {
			onserverready();
		}
	}

	function flushChunkBuffer() {
		if (!isServerReady || chunkBuffer.length === 0) {
			return;
		}

		while (chunkBuffer.length > 0) {
			const chunk = chunkBuffer.shift();
			if (chunk) {
				onaudiochunk(chunk);
			}
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

		// Reset state
		chunkBuffer = [];
		isServerReady = false;
		stopPending = false;
		recorderStopped = false;
		pendingChunkConversions = 0;

		// Create MediaRecorder with WebM format
		try {
			mediaRecorder = new MediaRecorder(stream, {
				mimeType: "audio/webm",
			});
		} catch (error) {
			console.error("Failed to create MediaRecorder:", error);
			alert("Failed to start recording");
			return;
		}

		mediaRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				pendingChunkConversions++;

				event.data
					.arrayBuffer()
					.then((buffer) => {
						if (isServerReady) {
							onaudiochunk(buffer);
						} else {
							chunkBuffer.push(buffer);
						}
					})
					.finally(() => {
						pendingChunkConversions = Math.max(
							0,
							pendingChunkConversions - 1,
						);
						checkStopCompletion();
					});
			}
		};

		mediaRecorder.addEventListener("stop", () => {
			recorderStopped = true;
			checkStopCompletion();
		});

		// First notify parent to send start_recording message
		onstart(recordingId);

		// Start MediaRecorder immediately - chunks will be buffered until server is ready
		mediaRecorder.start(500); // Emit chunks every 500ms
	}

	function stopRecording() {
		if (mediaRecorder && mediaRecorder.state !== "inactive") {
			stopPending = true;
			mediaRecorder.stop();
			return;
		}

		// If recorder was never started, still reset state and signal parent
		chunkBuffer = [];
		isServerReady = false;
		stopPending = false;
		recorderStopped = false;
		pendingChunkConversions = 0;
		onstop();
	}

	function checkStopCompletion() {
		if (stopPending && recorderStopped && pendingChunkConversions === 0) {
			finishStop();
		}
	}

	function finishStop() {
		if (chunkBuffer.length > 0) {
			if (isServerReady) {
				flushChunkBuffer();
			} else {
				console.warn(
					"Dropping buffered chunks because server never acknowledged recording start",
				);
				chunkBuffer = [];
			}
		}

		isServerReady = false;
		stopPending = false;
		recorderStopped = false;
		pendingChunkConversions = 0;
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
		background: #000000;
		border: 1px solid #003300;
		padding: 1.5rem;
		border-radius: 0.25rem;
	}

	h2 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: normal;
		color: #00ff00;
	}

	.error {
		color: #ff3333;
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
	}

	.info {
		color: #00aa00;
		margin: 0;
		font-size: 0.875rem;
	}

	.record-button {
		width: 100%;
		padding: 1rem;
		background: #003300;
		color: #00ff00;
		border: 1px solid #00aa00;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.record-button:hover {
		background: #004400;
		border-color: #00ff00;
	}

	.record-button.recording {
		background: #440000;
		color: #ff3333;
		border-color: #ff3333;
	}

	.record-button.recording:hover {
		background: #550000;
	}

	.retry-button {
		padding: 0.75rem 1.5rem;
		background: #003300;
		color: #00ff00;
		border: 1px solid #00aa00;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: #004400;
		border-color: #00ff00;
	}

	.recording-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.75rem;
		background: #0a0a0a;
		border: 1px solid #ff3333;
		border-radius: 0.25rem;
	}

	.pulse {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: #ff3333;
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			box-shadow: 0 0 0.5rem #ff3333;
		}
		50% {
			opacity: 0.5;
			box-shadow: 0 0 1rem #ff3333;
		}
	}

	.text {
		color: #ff3333;
		font-size: 0.875rem;
		font-weight: bold;
	}
</style>
