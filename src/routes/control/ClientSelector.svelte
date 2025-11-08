<script lang="ts">
	interface Props {
		clients: Array<{ session_id: string; connected_at: number }>;
		selectedClientId: string | null;
		onselect: (clientId: string) => void;
	}

	let { clients, selectedClientId, onselect }: Props = $props();

	function getColorFromSessionId(sessionId: string): string {
		// Simple hash function to generate color from session ID
		let hash = 0;
		for (let i = 0; i < sessionId.length; i++) {
			hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
		}

		const hue = Math.abs(hash % 360);
		return `hsl(${hue}, 70%, 50%)`;
	}

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString();
	}
</script>

<div class="client-selector">
	<h2>Keyboard Clients</h2>

	{#if clients.length === 0}
		<p class="no-clients">No clients connected</p>
	{:else}
		<div class="client-list">
			{#each clients as client (client.session_id)}
				<label class="client-item">
					<input
						type="radio"
						name="client"
						value={client.session_id}
						checked={selectedClientId === client.session_id}
						onchange={() => onselect(client.session_id)}
					/>
					<span
						class="radio-indicator"
						style="background-color: {getColorFromSessionId(client.session_id)}"
					></span>
					<span class="client-info">
						<span class="client-id">{client.session_id.slice(0, 8)}</span>
						<span class="client-time">Connected: {formatTimestamp(client.connected_at)}</span>
					</span>
				</label>
			{/each}
		</div>
	{/if}
</div>

<style>
	.client-selector {
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

	.no-clients {
		color: #00aa00;
		font-size: 0.875rem;
		margin: 0;
	}

	.client-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.client-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #0a0a0a;
		border: 1px solid #003300;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.client-item:hover {
		background: #001100;
		border-color: #00aa00;
	}

	.client-item input[type='radio'] {
		display: none;
	}

	.radio-indicator {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 0.5rem currentColor;
	}

	.client-item:has(input:checked) {
		background: #001a00;
		border-color: #00ff00;
	}

	.client-item:has(input:checked) .radio-indicator {
		box-shadow: 0 0 1rem currentColor;
	}

	.client-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.client-id {
		color: #00ff00;
		font-size: 0.875rem;
	}

	.client-time {
		color: #00aa00;
		font-size: 0.75rem;
	}
</style>
