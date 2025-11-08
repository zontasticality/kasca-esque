# KASCA-esque Spec

## Overview

A dual-endpoint web application for synchronized keystroke and audio recording. The system consists of a keyboard input endpoint and a control/monitoring endpoint that can record audio while capturing keystrokes from remote keyboard clients.

## Architecture

### Keyboard Endpoint (`/keyboard`)

**Purpose**: Capture and stream keystroke data.

#### UI
- Full-page textarea element
- No mouse interaction or paste support
- Minimal chrome/interface elements

#### Keystroke Capture
- Capture all keypress events with millisecond precision timestamps
- Track both `keydown` and `keyup` events

#### Session & Connection
- Client assigned unique session ID on connection
- WebSocket endpoint: `/ws/keyboard`
- Maintain persistent WebSocket connection for duration of session
- Stream keystroke data to server in real-time

#### Data Format
See [PROTOCOL.md](./PROTOCOL.md) for WebSocket message specifications.

### Control Endpoint (`/control`)

**Purpose**: Monitor keyboard clients, record audio, and coordinate data collection.

**WebSocket endpoint**: `/ws/control`

**Additional routes**: `/control/playback` (Recording Playback Panel)

#### Client Selection Component

**UI**:
- Radio button list of active keyboard clients
- Each client identified by session ID
- Each radio button colored uniquely based on hash of session ID
- Auto-update when clients connect/disconnect

**Functionality**:
- Display all active keyboard endpoint clients
- Track selection of target keyboard client for recording session
- Subscribe to WebSocket updates for client list changes

#### Audio Recording Component

**UI**:
- Single toggle button: "Start Recording" / "Stop Recording"
- Button changes appearance when active
- Animated recording indicator (pulsing/blinking) when active

**Functionality**:
- Capture audio from local microphone (MediaRecorder API)
- Start/stop recording sessions
- Stream audio data to server during recording
- Auto-stop recording when selected keyboard client disconnects

#### Audio Visualizer Component

**UI**:
- Real-time waveform visualization of microphone input
- Continuous display (even when not recording)
- Updates at 60fps minimum

**Functionality**:
- Access microphone via Web Audio API
- Render live waveform to canvas/WebGL
- Independent of recording state

#### Recording Playback Panel

**UI**:
- List of saved recordings
- Playback controls for each recording
- Delete button (soft delete)
- Keystroke event display (fading animated list)

**Functionality**:
- View all recordings (excluding soft-deleted)
- Play audio files
- Soft delete recordings (appends `_DELETED` to filename)
- Stream and display keystroke events (keydown/keyup) synchronized with playback
- Animate keystrokes in a fading list visualization 

## Styling

**Theme**: Dark with green highlights (terminal/hacker aesthetic)

**Color Palette**:
- Background: `#0a0a0a` or similar dark
- Primary text: `#00ff00` (bright green)
- Secondary text: `#00aa00` (medium green)
- Accents: `#003300` (dark green)
- Radio button colors: Generated from session ID hash

**Typography**:
- Monospace font family
- Clean, readable sizing

**Visual Style**:
- Minimal borders and decoration
- High contrast
- Focus on functionality over aesthetics

## Data Storage

**Storage location**: `./recordings/`

### Recording File Format

When recording is active, create timestamped file:

**Filename**: `recording_YYYYMMDD_HHMMSS.json`

**Structure**:
```json
{
  "recording_id": "uuid",
  "start_timestamp": 1234567890123,
  "end_timestamp": 1234567890999,
  "keyboard_session_id": "uuid",
  "control_session_id": "uuid",
  "keystrokes": [
    {
      "timestamp": 1234567890123,
      "key": "a",
      "event_type": "keydown"
    }
  ],
  "audio_file": "recording_YYYYMMDD_HHMMSS.webm"
}
```

**Audio File**: Separate file in `.webm` format, referenced by main JSON file.

## Technical Requirements

### Server

#### WebSocket Handlers

**Connection Management**:
- Handle multiple concurrent keyboard clients
- Handle multiple control clients
- Generate unique session IDs for all clients
- Track active connections and clean up on disconnect

**Keystroke Stream** (`/keyboard` clients):
- Receive keystroke events from keyboard clients
- Forward keystroke data to recording system when active

**Audio Stream** (control clients):
- Receive audio data from control clients during recording
- Write audio stream to file storage

**Client Registry Broadcast** (control clients):
- Maintain list of active keyboard clients
- Broadcast client list updates to all control clients on connect/disconnect

#### File Storage

**Recording Writer**:
- Write recording metadata to JSON in `./recordings/`
- Write audio stream to `.webm` file
- Ensure atomic writes
- Handle concurrent recordings (if multiple control clients)

### Client

#### Technology Stack
- **Framework**: Svelte 5 + SvelteKit
- **Runtime**: Node.js (for server-side file operations)

#### Browser APIs Required
- WebSocket API (both endpoints)
- MediaRecorder API (control endpoint - audio capture)
- Web Audio API (control endpoint - visualization)
- Canvas or WebGL (control endpoint - waveform rendering)
- Modern ES6+ JavaScript support

#### Keyboard Endpoint Implementation
- Minimal JavaScript for keystroke capture
- WebSocket client for streaming
- No framework dependencies required

#### Control Endpoint Implementation
- Audio permission handling and error states
- Dynamic UI updates for real-time client list
- WebSocket client for bidirectional communication

## Security Considerations

**Authentication**: Not implemented in initial version

**Client Isolation**: Keyboard clients must not communicate with each other

**Data Sensitivity**:
- Audio data contains sensitive information
- Keystroke data may contain passwords/sensitive input

**Transport Security**: Use HTTPS/WSS for production deployment