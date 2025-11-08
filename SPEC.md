# KASCA-esque Spec

## Overview

A dual-endpoint web application for synchronized keystroke and audio recording. The system consists of a keyboard input endpoint and a control/monitoring endpoint that can record audio while capturing keystrokes from remote keyboard clients.

## Architecture

### Keyboard Endpoint (`/keyboard`)

**Purpose**: Capture and stream keystroke data.

**UI Components**:
- Full-page textarea element
- No mouse interaction or paste support
- Minimal chrome/interface elements

**Functionality**:
- Capture all keypress events with millisecond precision timestamps
- Stream keystroke data to server via WebSocket
- Each client assigned unique session ID on connection
- Maintain persistent connection for duration of session

**Data Format** (streamed to server):
```json
{
  "session_id": "uuid",
  "timestamp": 1234567890123,
  "key": "a",
  "event_type": "keydown|keyup"
}
```

### Control Endpoint (`/control`)

**Purpose**: Monitor keyboard clients, record audio, and coordinate data collection.

**UI Components**:

1. **Client Selector**
   - Radio button list of active keyboard clients
   - Each client identified by session ID
   - Each radio button colored uniquely based on hash of session ID
   - Auto-update when clients connect/disconnect

2. **Recording Controls**
   - Single button toggles between "Start Recording" and "Stop Recording" states
   - Button changes appearance when active

3. **Audio Visualizer**
   - Real-time waveform visualization of microphone input
   - Continuous display (even when not recording)
   - Updates at 60fps minimum

4. **Recording Indicator**
   - Animated visual indicator when recording is active
   - Pulsing or blinking animation

**Functionality**:
- List all active keyboard endpoint clients
- Select target keyboard client for recording session
- Capture audio from local microphone
- Start/stop recording sessions
- Display live audio waveform
- Send audio stream to server when recording
- Recording should stop automatically when session on `/keyboard` disconnects.
- Panel to view, play, and delete (doesn't actually delete, just appends `_DELETED` to the file). Should also support streaming the keyboard (keypress up/down) stream and displaying it in a fading animated list. 

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
  "audio_file": "recording_YYYYMMDD_HHMMSS.wav"
}
```

**Audio File**: Separate file in `.wav`, referenced by main JSON file.

## Technical Requirements

### Server

**WebSocket Support**:
- Handle multiple concurrent keyboard clients
- Broadcast keyboard client list to control clients
- Stream keystroke data from keyboard clients
- Stream audio data from control clients

**Session Management**:
- Generate unique session IDs for all clients
- Track active connections
- Clean up on disconnect

**File Storage**:
- Write recording metadata to JSON
- Write audio stream to audio file
- Ensure atomic writes
- Handle concurrent recordings (if multiple control clients)

### Client

**Browser Requirements**:
- WebSocket API
- MediaRecorder API for audio capture
- Web Audio API for visualization
- Modern ES6+ JavaScript support

**Framework Details**
 - Use Svelte5 + SvelteKit w/ Node to write to files.

**Keyboard Endpoint**:
- Minimal JavaScript for keystroke capture and WebSocket
- No framework requirements

**Control Endpoint**:
- Canvas or WebGL for audio visualization
- Audio permission handling
- Dynamic UI updates for client list

## Security Considerations

- No authentication specified (optional future enhancement)
- Keyboard clients should be isolated (no cross-client communication)
- Audio data contains sensitive information
- Consider HTTPS/WSS for production deployment

## Future Enhancements

- Multiple simultaneous recordings
- Playback functionality
- Authentication and authorization
- Recording metadata (notes, tags)
- Export to different formats
- Real-time keystroke display on control endpoint
