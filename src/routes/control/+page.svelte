<script lang="ts">
	import { onMount } from 'svelte';
	import ClientSelector from './ClientSelector.svelte';
	import AudioRecorder from './AudioRecorder.svelte';
	import AudioVisualizer from './AudioVisualizer.svelte';

	let sessionId = $state('');
	let connected = $state(false);
	let ws: WebSocket | null = null;
	let clients = $state<Array<{ session_id: string; connected_at: number }>>([]);
	let selectedClientId = $state<string | null>(null);
	let isRecording = $state(false);
	let currentRecordingId = $state<string | null>(null);
	let audioRecorderRef: AudioRecorder | null = null;

	onMount(() => {
		connectWebSocket();

		return () => {
			if (ws) {
				ws.close();
			}
		};
	});

	function connectWebSocket() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/ws/control`;

		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			console.log('Connected to control endpoint');
		};

		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			handleMessage(message);
		};

		ws.onclose = () => {
			connected = false;
			console.log('Disconnected from control endpoint');
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	function handleMessage(message: any) {
		console.log('Received message:', message);

		switch (message.type) {
			case 'session_assigned':
				sessionId = message.session_id;
				break;
			case 'client_list':
				clients = message.clients;
				// If selected client is no longer in list, clear selection
				if (selectedClientId && !clients.find((c) => c.session_id === selectedClientId)) {
					selectedClientId = null;
				}
				break;
			case 'recording_started':
				console.log('Recording started:', message);
				// Notify AudioRecorder that server is ready to receive chunks
				if (audioRecorderRef) {
					audioRecorderRef.notifyServerReady();
				}
				break;
			case 'recording_stopped':
				console.log('Recording stopped:', message);
				isRecording = false;
				currentRecordingId = null;
				break;
			case 'error':
				console.error('Server error:', message.error, message.context);
				alert(`Error: ${message.error}`);
				isRecording = false;
				currentRecordingId = null;
				break;
		}
	}

	function handleClientSelect(clientId: string) {
		selectedClientId = clientId;
	}

	function handleRecordingStart(recordingId: string) {
		if (!selectedClientId || !ws || ws.readyState !== WebSocket.OPEN) {
			alert('Please select a keyboard client first');
			return;
		}

		currentRecordingId = recordingId;
		isRecording = true;

		const message = {
			type: 'start_recording',
			keyboard_session_id: selectedClientId,
			recording_id: recordingId
		};

		ws.send(JSON.stringify(message));
	}

	function handleRecordingStop() {
		if (!currentRecordingId || !ws || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const message = {
			type: 'stop_recording',
			recording_id: currentRecordingId
		};

		ws.send(JSON.stringify(message));
	}

	function handleAudioChunk(chunk: ArrayBuffer) {
		if (!ws || !currentRecordingId || !selectedClientId || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		// Create buffer with header (recording_id + keyboard_session_id) + audio data
		const recordingIdBuffer = new TextEncoder().encode(currentRecordingId.padEnd(36, ' '));
		const keyboardSessionIdBuffer = new TextEncoder().encode(selectedClientId.padEnd(36, ' '));

		const combined = new Uint8Array(72 + chunk.byteLength);
		combined.set(recordingIdBuffer, 0);
		combined.set(keyboardSessionIdBuffer, 36);
		combined.set(new Uint8Array(chunk), 72);

		ws.send(combined.buffer);
	}
</script>

<div class="control-container">
	<div class="header">
		<h1>Control Panel</h1>
		<div class="status">
			<span class="status-indicator" class:connected={connected}></span>
			{#if sessionId}
				<span class="session-id">Session: {sessionId.slice(0, 8)}</span>
			{/if}
		</div>
	</div>

	<div class="main-content">
		<div class="left-panel">
			<ClientSelector {clients} {selectedClientId} onselect={handleClientSelect} />

			<AudioRecorder
				bind:this={audioRecorderRef}
				{isRecording}
				onstart={handleRecordingStart}
				onstop={handleRecordingStop}
				onaudiochunk={handleAudioChunk}
			/>
		</div>

		<div class="right-panel">
			<AudioVisualizer />
		</div>
	</div>

	<div class="footer">
		<a href="/control/playback">View Recordings</a>
	</div>
</div>

<style>
	.control-container {
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
		color: #00ff00;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-indicator {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #555555;
	}

	.status-indicator.connected {
		background: #00ff00;
		box-shadow: 0 0 0.5rem #00ff00;
	}

	.session-id {
		color: #00aa00;
		font-size: 0.875rem;
	}

	.main-content {
		flex: 1;
		display: flex;
		gap: 2rem;
		padding: 2rem;
		overflow: hidden;
	}

	.left-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.right-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.footer {
		padding: 1rem 2rem;
		background: #000000;
		border-top: 1px solid #003300;
		text-align: center;
	}

	.footer a {
		color: #00ff00;
		text-decoration: none;
	}

	.footer a:hover {
		text-decoration: underline;
	}
</style>
