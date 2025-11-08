<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
		color: #00ff00;
		font-family: 'Courier New', Courier, monospace;
		overflow: hidden;
	}

	:global(body::-webkit-scrollbar) {
		width: 0.5rem;
	}

	:global(body::-webkit-scrollbar-track) {
		background: #000000;
	}

	:global(body::-webkit-scrollbar-thumb) {
		background: #003300;
	}

	:global(body::-webkit-scrollbar-thumb:hover) {
		background: #00aa00;
	}
</style>
