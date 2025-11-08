# KASCA-esque

A dual-endpoint web application for synchronized keystroke and audio recording. The system consists of a keyboard input endpoint and a control/monitoring endpoint that can record audio while capturing keystrokes from remote keyboard clients.

## Documentation

- [SPEC.md](./SPEC.md) - Full specification and architecture
- [PROTOCOL.md](./PROTOCOL.md) - WebSocket protocol specification

## Installation

```sh
npm install
```

## Development

Start the development server:

```sh
npm run dev
```

Note: In development mode, the WebSocket server is not available. You must build and run in production mode to use WebSocket features.

## Production

Build the application:

```sh
npm run build
```

Run the production server (with WebSocket support):

```sh
npm start
# or
npm run preview
```

The server will start on `http://localhost:3000` by default.

## Usage

1. **Home Page** (`/`): Navigation to all endpoints
2. **Keyboard Endpoint** (`/keyboard`): Open this on devices where you want to capture keystrokes
3. **Control Panel** (`/control`): Monitor connected keyboards, select one, and record audio synchronized with keystrokes
4. **Playback Panel** (`/control/playback`): View, play, and delete recordings

## WebSocket Endpoints

- `ws://localhost:3000/ws/keyboard` - Keyboard clients connect here
- `ws://localhost:3000/ws/control` - Control clients connect here

## Recordings

Recordings are stored in `./recordings/` directory with:
- `recording_YYYYMMDD_HHMMSS.json` - Metadata and keystroke data
- `recording_YYYYMMDD_HHMMSS.webm` - Audio file

## Architecture

Built with:
- **Frontend**: Svelte 5 + SvelteKit
- **Backend**: Node.js with Express
- **WebSockets**: ws library
- **Audio**: MediaRecorder API (WebM format)
- **Styling**: Dark theme with green highlights (terminal/hacker aesthetic)
