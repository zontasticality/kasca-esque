<script lang="ts">
	import { onMount } from 'svelte';

	let sessionId = $state('');
	let connected = $state(false);
	let ws: WebSocket | null = null;
	let textareaValue = $state('');

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
		const wsUrl = `${protocol}//${window.location.host}/ws/keyboard`;

		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			console.log('Connected to keyboard endpoint');
		};

		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.type === 'session_assigned') {
				sessionId = message.session_id;
				console.log('Session ID:', sessionId);
			}
		};

		ws.onclose = () => {
			connected = false;
			console.log('Disconnected from keyboard endpoint');
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};
	}

	function sendKeystroke(key: string, eventType: 'keydown' | 'keyup') {
		if (!ws || !sessionId || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const message = {
			type: 'keystroke',
			session_id: sessionId,
			timestamp: Date.now(),
			key: key,
			event_type: eventType
		};

		ws.send(JSON.stringify(message));
	}

	function handleKeydown(event: KeyboardEvent) {
		sendKeystroke(event.key, 'keydown');
	}

	function handleKeyup(event: KeyboardEvent) {
		sendKeystroke(event.key, 'keyup');
	}

	function handlePaste(event: ClipboardEvent) {
		// Block paste events
		event.preventDefault();
	}

	function handleMouseDown(event: MouseEvent) {
		// Block text selection but allow focus
		// Don't prevent default entirely
	}

	function handleContextMenu(event: MouseEvent) {
		// Block right-click menu
		event.preventDefault();
	}
</script>

<div class="keyboard-container">
	<div class="status-bar">
		<span class="status-indicator" class:connected={connected}></span>
		{#if sessionId}
			<span class="session-id">Session: {sessionId.slice(0, 8)}</span>
		{/if}
	</div>

	<textarea
		bind:value={textareaValue}
		onkeydown={handleKeydown}
		onkeyup={handleKeyup}
		onpaste={handlePaste}
		onmousedown={handleMouseDown}
		oncontextmenu={handleContextMenu}
		placeholder="Start typing..."
		autocomplete="off"
		spellcheck="false"
	></textarea>
</div>

<style>
	.keyboard-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #0a0a0a;
		overflow: hidden;
	}

	.status-bar {
		padding: 0.5rem 1rem;
		background: #000000;
		border-bottom: 1px solid #003300;
		display: flex;
		align-items: center;
		gap: 1rem;
		font-family: monospace;
		font-size: 0.875rem;
		color: #00aa00;
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
	}

	textarea {
		flex: 1;
		width: 100%;
		padding: 2rem;
		background: #0a0a0a;
		color: #00ff00;
		font-family: monospace;
		font-size: 1.125rem;
		border: none;
		outline: none;
		resize: none;
		line-height: 1.6;
		cursor: text;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
	}

	textarea::placeholder {
		color: #003300;
	}

	textarea::selection {
		background: #003300;
		color: #00ff00;
	}
</style>
