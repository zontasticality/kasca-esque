<script lang="ts">
	import { onMount } from "svelte";

	let sessionId = $state("");
	let connected = $state(false);
	let ws: WebSocket | null = null;
	let textareaValue = $state("");

	onMount(() => {
		connectWebSocket();

		// Listen for selection changes
		const selectionHandler = () => handleSelectionChange();
		document.addEventListener("selectionchange", selectionHandler);

		return () => {
			if (ws) {
				ws.close();
			}
			document.removeEventListener("selectionchange", selectionHandler);
		};
	});

	function connectWebSocket() {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/ws/keyboard`;

		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			console.log("Connected to keyboard endpoint");
		};

		ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.type === "session_assigned") {
				sessionId = message.session_id;
				console.log("Session ID:", sessionId);
			} else if (message.type === "request_final_text") {
				// Respond with current text content
				const response = {
					type: "final_text_response",
					recording_id: message.recording_id,
					final_text: textareaValue,
				};
				ws?.send(JSON.stringify(response));
				console.log("Sent final text response");
			}
		};

		ws.onclose = () => {
			connected = false;
			console.log("Disconnected from keyboard endpoint");
		};

		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
		};
	}

	function sendKeystroke(
		event: KeyboardEvent,
		eventType: "keydown" | "keyup",
	) {
		if (!ws || !sessionId || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		const physicalKey = event.code || event.key || "Unidentified";
		const message = {
			type: "event",
			session_id: sessionId,
			event: {
				type: eventType,
				ts: Date.now(),
				key: physicalKey,
			},
		};

		ws.send(JSON.stringify(message));
	}

	function handleKeydown(event: KeyboardEvent) {
		sendKeystroke(event, "keydown");
	}

	function handleKeyup(event: KeyboardEvent) {
		sendKeystroke(event, "keyup");
	}

	function handlePaste(event: ClipboardEvent) {
		// Block paste events
		event.preventDefault();
	}

	// Selection tracking state
	let selectionAnchor: number | null = null;
	let lastSelectionDelta: number = 0;
	let textareaRef: HTMLTextAreaElement | null = null;
	let isMouseSelecting: boolean = false; // Only track selection during active mouse drag

	function handleMouseDown(event: MouseEvent) {
		if (!ws || !sessionId || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		isMouseSelecting = true;

		// Get cursor position from textarea after a microtask (selection updates after mousedown)
		requestAnimationFrame(() => {
			if (textareaRef) {
				selectionAnchor = textareaRef.selectionStart;
				lastSelectionDelta = 0;

				const message = {
					type: "event",
					session_id: sessionId,
					event: {
						type: "mousedown",
						ts: Date.now(),
						pos: selectionAnchor,
					},
				};
				ws?.send(JSON.stringify(message));
			}
		});
	}

	function handleMouseUp(event: MouseEvent) {
		if (!ws || !sessionId || ws.readyState !== WebSocket.OPEN) {
			return;
		}

		isMouseSelecting = false;

		// Record the final selection bounds for accurate replay
		const selStart = textareaRef?.selectionStart ?? 0;
		const selEnd = textareaRef?.selectionEnd ?? 0;

		const message = {
			type: "event",
			session_id: sessionId,
			event: {
				type: "mouseup",
				ts: Date.now(),
				selectionStart: selStart,
				selectionEnd: selEnd,
			},
		};

		ws.send(JSON.stringify(message));

		// Only reset anchor after sending
		selectionAnchor = null;
	}

	function handleSelectionChange() {
		// Only track selection changes during active mouse selection
		if (
			!ws ||
			!sessionId ||
			ws.readyState !== WebSocket.OPEN ||
			!textareaRef ||
			!isMouseSelecting || // Only during active mouse drag
			selectionAnchor === null
		) {
			return;
		}

		// Calculate delta from anchor
		const selStart = textareaRef.selectionStart;
		const selEnd = textareaRef.selectionEnd;

		// Determine the current "focus" (non-anchor end of selection)
		const focus = selEnd !== selectionAnchor ? selEnd : selStart;
		const newDelta = focus - selectionAnchor;

		// Only send if delta changed
		if (newDelta !== lastSelectionDelta) {
			lastSelectionDelta = newDelta;

			const message = {
				type: "event",
				session_id: sessionId,
				event: {
					type: "select",
					ts: Date.now(),
					delta: newDelta,
				},
			};
			ws.send(JSON.stringify(message));
		}
	}

	function handleContextMenu(event: MouseEvent) {
		// Block right-click menu
		event.preventDefault();
	}
</script>

<div class="keyboard-container">
	<div class="status-bar">
		<span class="status-indicator" class:connected></span>
		{#if sessionId}
			<span class="session-id">Session: {sessionId.slice(0, 8)}</span>
		{/if}
	</div>

	<textarea
		bind:this={textareaRef}
		bind:value={textareaValue}
		onkeydown={handleKeydown}
		onkeyup={handleKeyup}
		onpaste={handlePaste}
		onmousedown={handleMouseDown}
		onmouseup={handleMouseUp}
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
