<div class="home-container">
	<div class="content">
		<h1>KASCA-esque</h1>
		<p class="subtitle">Synchronized Keystroke and Audio Recording</p>

		<div class="nav-buttons">
			<a href="/keyboard" class="nav-button">
				<span class="button-title">Keyboard Endpoint</span>
				<span class="button-desc">Capture and stream keystrokes</span>
			</a>

			<a href="/control" class="nav-button">
				<span class="button-title">Control Panel</span>
				<span class="button-desc">Monitor clients and record audio</span>
			</a>

			<a href="/control/playback" class="nav-button">
				<span class="button-title">Playback Panel</span>
				<span class="button-desc">View and play recordings</span>
			</a>
		</div>
	</div>
</div>

<style>
	.home-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #0a0a0a;
		font-family: monospace;
	}

	.content {
		text-align: center;
		max-width: 40rem;
		padding: 2rem;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		font-size: 3rem;
		font-weight: normal;
		color: #00ff00;
		text-shadow: 0 0 1rem #00ff00;
	}

	.subtitle {
		margin: 0 0 3rem 0;
		color: #00aa00;
		font-size: 1.125rem;
	}

	.nav-buttons {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.nav-button {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.5rem;
		background: #000000;
		border: 1px solid #003300;
		border-radius: 0.25rem;
		color: #00ff00;
		text-decoration: none;
		transition: all 0.2s;
	}

	.nav-button:hover {
		background: #001100;
		border-color: #00ff00;
		box-shadow: 0 0 1rem #003300;
	}

	.button-title {
		font-size: 1.25rem;
	}

	.button-desc {
		font-size: 0.875rem;
		color: #00aa00;
	}
</style>
