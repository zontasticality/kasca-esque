# WebSocket Protocol Specification

## Endpoints

- **Keyboard clients**: `ws://localhost:PORT/ws/keyboard`
- **Control clients**: `ws://localhost:PORT/ws/control`

---

## Keyboard Client Messages

### Client → Server: Keystroke Event

Sent on every keydown/keyup event.

```json
{
  "type": "keystroke",
  "session_id": "uuid-v4-string",
  "timestamp": 1234567890123,
  "key": "a",
  "event_type": "keydown"
}
```

**Fields**:
- `type`: Always `"keystroke"`
- `session_id`: Unique session ID assigned on connection
- `timestamp`: Unix timestamp in milliseconds
- `key`: Key value from KeyboardEvent.key
- `event_type`: Either `"keydown"` or `"keyup"`

### Server → Client: Session Assignment

Sent immediately after WebSocket connection is established.

```json
{
  "type": "session_assigned",
  "session_id": "uuid-v4-string"
}
```

**Fields**:
- `type`: Always `"session_assigned"`
- `session_id`: Unique session ID for this client

---

## Control Client Messages

### Server → Client: Session Assignment

Sent immediately after WebSocket connection is established.

```json
{
  "type": "session_assigned",
  "session_id": "uuid-v4-string"
}
```

**Fields**:
- `type`: Always `"session_assigned"`
- `session_id`: Unique session ID for this control client

### Server → Client: Keyboard Client List Update

Sent when keyboard clients connect or disconnect. Sent immediately on control client connection with current list.

```json
{
  "type": "client_list",
  "clients": [
    {
      "session_id": "uuid-v4-string",
      "connected_at": 1234567890123
    }
  ]
}
```

**Fields**:
- `type`: Always `"client_list"`
- `clients`: Array of active keyboard clients
  - `session_id`: Keyboard client's session ID
  - `connected_at`: Unix timestamp in milliseconds when client connected

### Client → Server: Start Recording

Sent when control client starts a recording session.

```json
{
  "type": "start_recording",
  "keyboard_session_id": "uuid-v4-string",
  "recording_id": "uuid-v4-string"
}
```

**Fields**:
- `type`: Always `"start_recording"`
- `keyboard_session_id`: Session ID of the keyboard client to record
- `recording_id`: Unique ID for this recording (generated client-side)

### Client → Server: Audio Chunk

Sent repeatedly during recording as MediaRecorder produces chunks.

**Format**: Binary WebSocket message (ArrayBuffer)

**Structure**:
1. First 36 bytes: `recording_id` (UTF-8 string, fixed length)
2. Next 36 bytes: `keyboard_session_id` (UTF-8 string, fixed length)
3. Remaining bytes: WebM audio data chunk

**Note**: UUIDs are sent as strings (e.g., "550e8400-e29b-41d4-a716-446655440000") for simplicity.

### Client → Server: Stop Recording

Sent when control client stops recording.

```json
{
  "type": "stop_recording",
  "recording_id": "uuid-v4-string"
}
```

**Fields**:
- `type`: Always `"stop_recording"`
- `recording_id`: ID of the recording to stop

### Server → Client: Recording Started Confirmation

Sent after server successfully starts a recording.

```json
{
  "type": "recording_started",
  "recording_id": "uuid-v4-string",
  "keyboard_session_id": "uuid-v4-string",
  "start_timestamp": 1234567890123
}
```

**Fields**:
- `type`: Always `"recording_started"`
- `recording_id`: ID of the recording
- `keyboard_session_id`: Session ID of keyboard being recorded
- `start_timestamp`: Server timestamp when recording started

### Server → Client: Recording Stopped Confirmation

Sent after server successfully stops and finalizes a recording.

```json
{
  "type": "recording_stopped",
  "recording_id": "uuid-v4-string",
  "end_timestamp": 1234567890123,
  "filename": "recording_YYYYMMDD_HHMMSS.json"
}
```

**Fields**:
- `type`: Always `"recording_stopped"`
- `recording_id`: ID of the recording
- `end_timestamp`: Server timestamp when recording stopped
- `filename`: Name of the saved recording JSON file

### Server → Client: Error

Sent when an error occurs (e.g., trying to start recording for non-existent keyboard client).

```json
{
  "type": "error",
  "error": "Description of error",
  "context": {
    "recording_id": "uuid-v4-string"
  }
}
```

**Fields**:
- `type`: Always `"error"`
- `error`: Human-readable error message
- `context`: Optional object with relevant context (e.g., recording_id, keyboard_session_id)

---

## Connection Lifecycle

### Keyboard Client

1. Client connects to `/ws/keyboard`
2. Server sends `session_assigned` message
3. Client stores session_id and begins sending `keystroke` events
4. On disconnect, server removes client from active list and broadcasts updated `client_list` to control clients

### Control Client

1. Client connects to `/ws/control`
2. Server sends `session_assigned` message
3. Server sends current `client_list` message
4. Client receives `client_list` updates as keyboard clients connect/disconnect
5. When user starts recording:
   - Client generates `recording_id`
   - Client sends `start_recording` with selected `keyboard_session_id`
   - Server responds with `recording_started` confirmation
   - Client begins sending `audio_chunk` binary messages
6. When user stops recording OR keyboard client disconnects:
   - Client sends `stop_recording`
   - Server responds with `recording_stopped` confirmation

---

## Error Handling

### Keyboard Client Disconnects During Recording

When a keyboard client disconnects while being recorded:
1. Server stops accepting keystrokes for that recording
2. Server sends message to recording control client (auto-stop signal)
3. Control client should auto-stop recording and send `stop_recording`
4. Server finalizes recording with keystrokes received up to disconnect

### Control Client Disconnects During Recording

When a control client disconnects while recording:
1. Server finalizes the recording immediately
2. Server saves all keystrokes received up to disconnect
3. Audio file contains all chunks received before disconnect

### Invalid Recording Targets

If control client sends `start_recording` with invalid `keyboard_session_id`:
- Server sends `error` message
- No recording is created
