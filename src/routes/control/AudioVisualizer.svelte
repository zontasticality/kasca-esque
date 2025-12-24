<script lang="ts">
	import { onMount } from "svelte";
	import {
		acquireMediaStream,
		releaseMediaStream,
	} from "$lib/utils/mediaStream";

	let canvas: HTMLCanvasElement;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let dataArray: Uint8Array<ArrayBuffer> | null = null;
	let animationId: number | null = null;

	onMount(() => {
		initAudio();

		return () => {
			cleanup();
		};
	});

	async function initAudio() {
		try {
			const stream = await acquireMediaStream();
			audioContext = new AudioContext();
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 2048;

			const source = audioContext.createMediaStreamSource(stream);
			source.connect(analyser);

			const bufferLength = analyser.frequencyBinCount;
			dataArray = new Uint8Array(bufferLength) as Uint8Array<ArrayBuffer>;

			draw();
		} catch (error) {
			console.error("Failed to initialize audio:", error);
		}
	}

	function draw() {
		if (!canvas || !analyser || !dataArray) return;

		animationId = requestAnimationFrame(draw);

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		analyser.getByteTimeDomainData(dataArray);

		const width = canvas.width;
		const height = canvas.height;

		// Clear canvas
		ctx.fillStyle = "#0a0a0a";
		ctx.fillRect(0, 0, width, height);

		// Draw waveform
		ctx.lineWidth = 2;
		ctx.strokeStyle = "#00ff00";
		ctx.beginPath();

		const sliceWidth = width / dataArray.length;
		let x = 0;

		for (let i = 0; i < dataArray.length; i++) {
			const v = dataArray[i] / 128.0;
			const y = (v * height) / 2;

			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}

			x += sliceWidth;
		}

		ctx.stroke();
	}

	function cleanup() {
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
		}
		if (audioContext) {
			audioContext.close();
		}
		releaseMediaStream();
	}

	function handleResize() {
		if (canvas) {
			canvas.width = canvas.offsetWidth;
			canvas.height = canvas.offsetHeight;
		}
	}
</script>

<svelte:window onresize={handleResize} />

<div class="audio-visualizer">
	<h2>Audio Waveform</h2>
	<div class="canvas-container">
		<canvas bind:this={canvas}></canvas>
	</div>
</div>

<style>
	.audio-visualizer {
		background: var(--panel-bg);
		border: var(--panel-border);
		padding: var(--panel-padding);
		border-radius: var(--panel-radius);
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	h2 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: normal;
		color: var(--text-primary);
	}

	.canvas-container {
		flex: 1;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: var(--panel-radius);
		overflow: hidden;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
