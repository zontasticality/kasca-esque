<script lang="ts">
	import favicon from "$lib/assets/favicon.svg";
	import "$lib/styles/theme.css";

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
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-family: var(--font-mono);
		overflow: hidden;
	}

	:global(body::-webkit-scrollbar) {
		width: 0.5rem;
	}

	:global(body::-webkit-scrollbar-track) {
		background: var(--bg-primary);
	}

	:global(body::-webkit-scrollbar-thumb) {
		background: var(--border-primary);
	}

	:global(body::-webkit-scrollbar-thumb:hover) {
		background: var(--text-secondary);
	}
</style>
