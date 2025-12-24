import assert from 'node:assert/strict';
import test from 'node:test';
import { TextTimeline, type KeystrokeEvent } from '../src/lib/text/textTimeline';

// ============================================================================
// Helper Functions to Generate Event Sequences
// ============================================================================

/**
 * Creates a keystroke event at a given timestamp
 */
function key(keyCode: string, eventType: 'keydown' | 'keyup', timestamp: number): KeystrokeEvent {
    return { key: keyCode, event_type: eventType, timestamp };
}

/**
 * Creates a keydown event
 */
function kd(keyCode: string, timestamp: number): KeystrokeEvent {
    return key(keyCode, 'keydown', timestamp);
}

/**
 * Creates a keyup event
 */
function ku(keyCode: string, timestamp: number): KeystrokeEvent {
    return key(keyCode, 'keyup', timestamp);
}

/**
 * Creates a full keypress (keydown + keyup) with automatic timing
 */
function press(keyCode: string, startTime: number, duration = 50): KeystrokeEvent[] {
    return [kd(keyCode, startTime), ku(keyCode, startTime + duration)];
}

/**
 * Generates a sequence of keypresses to type a string.
 * Handles uppercase letters by inserting shift keypresses.
 */
function typeString(text: string, startTime = 0, keyInterval = 100): KeystrokeEvent[] {
    const events: KeystrokeEvent[] = [];
    let time = startTime;

    for (const char of text) {
        let keyCode: string;
        let needsShift = false;

        if (char === ' ') {
            keyCode = 'Space';
        } else if (char === '\n') {
            keyCode = 'Enter';
        } else if (char === '\t') {
            keyCode = 'Tab';
        } else if (char >= 'A' && char <= 'Z') {
            keyCode = `Key${char}`;
            needsShift = true;
        } else if (char >= 'a' && char <= 'z') {
            keyCode = `Key${char.toUpperCase()}`;
        } else if (char >= '0' && char <= '9') {
            keyCode = `Digit${char}`;
        } else if (char === '.') {
            keyCode = 'Period';
        } else if (char === ',') {
            keyCode = 'Comma';
        } else if (char === '!') {
            keyCode = 'Digit1';
            needsShift = true;
        } else if (char === '@') {
            keyCode = 'Digit2';
            needsShift = true;
        } else if (char === '?') {
            keyCode = 'Slash';
            needsShift = true;
        } else if (char === '-') {
            keyCode = 'Minus';
        } else if (char === '_') {
            keyCode = 'Minus';
            needsShift = true;
        } else if (char === "'") {
            keyCode = 'Quote';
        } else if (char === '"') {
            keyCode = 'Quote';
            needsShift = true;
        } else {
            // Fallback for other characters
            keyCode = `Key${char.toUpperCase()}`;
        }

        if (needsShift) {
            events.push(kd('ShiftLeft', time));
            time += 10;
        }

        events.push(...press(keyCode, time));
        time += 50;

        if (needsShift) {
            events.push(ku('ShiftLeft', time));
            time += 10;
        }

        time += keyInterval - 60;
    }

    return events;
}

/**
 * Creates backspace keypresses
 */
function backspace(count: number, startTime = 0, interval = 100): KeystrokeEvent[] {
    const events: KeystrokeEvent[] = [];
    let time = startTime;
    for (let i = 0; i < count; i++) {
        events.push(...press('Backspace', time));
        time += interval;
    }
    return events;
}

/**
 * Creates arrow key presses to move cursor
 */
function arrow(direction: 'Left' | 'Right' | 'Up' | 'Down', count: number, startTime = 0, interval = 50): KeystrokeEvent[] {
    const events: KeystrokeEvent[] = [];
    let time = startTime;
    for (let i = 0; i < count; i++) {
        events.push(...press(`Arrow${direction}`, time));
        time += interval;
    }
    return events;
}

/**
 * Gets the final text from a sequence of events
 */
function getFinalText(events: KeystrokeEvent[]): string {
    if (events.length === 0) return '';
    const timeline = new TextTimeline(events);
    const maxTime = Math.max(...events.map(e => e.timestamp)) + 1;
    return timeline.getTextAt(timeline.baseTime + maxTime);
}

/**
 * Gets the final state (text and cursor) from a sequence of events
 */
function getFinalState(events: KeystrokeEvent[]) {
    if (events.length === 0) return { text: '', cursor: 0 };
    const timeline = new TextTimeline(events);
    const maxTime = Math.max(...events.map(e => e.timestamp)) + 1;
    return timeline.getStateAt(timeline.baseTime + maxTime);
}

// ============================================================================
// Basic Typing Tests
// ============================================================================

test('TextTimeline: empty input returns empty string', () => {
    const timeline = new TextTimeline([]);
    const state = timeline.getStateAt(0);
    assert.equal(state.text, '');
    assert.equal(state.cursor, 0);
});

test('TextTimeline: simple word typing', () => {
    const events = typeString('hello');
    const result = getFinalText(events);
    assert.equal(result, 'hello');
});

test('TextTimeline: uppercase letters with shift', () => {
    const events = typeString('Hello');
    const result = getFinalText(events);
    assert.equal(result, 'Hello');
});

test('TextTimeline: numbers', () => {
    const events = typeString('12345');
    const result = getFinalText(events);
    assert.equal(result, '12345');
});

test('TextTimeline: sentence with spaces', () => {
    const events = typeString('hello world');
    const result = getFinalText(events);
    assert.equal(result, 'hello world');
});

// ============================================================================
// Multiline Tests
// ============================================================================

test('TextTimeline: multiline with Enter key', () => {
    const events = typeString('line1\nline2\nline3');
    const result = getFinalText(events);
    assert.equal(result, 'line1\nline2\nline3');
});

test('TextTimeline: mixed content with tabs', () => {
    const events = typeString('a\tb\tc');
    const result = getFinalText(events);
    assert.equal(result, 'a\tb\tc');
});

// ============================================================================
// Backspace and Delete Tests
// ============================================================================

test('TextTimeline: backspace deletes last character', () => {
    const events = [
        ...typeString('hellox'),
        ...backspace(1, 1000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'hello');
});

test('TextTimeline: multiple backspaces', () => {
    const events = [
        ...typeString('hello'),
        ...backspace(3, 1000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'he');
});

test('TextTimeline: backspace at start does nothing', () => {
    const events = [
        ...backspace(5, 0),
        ...typeString('hello', 1000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'hello');
});

// ============================================================================
// Cursor Movement Tests
// ============================================================================

test('TextTimeline: ArrowLeft moves cursor', () => {
    const events = [
        ...typeString('hello', 0),
        ...arrow('Left', 2, 1000),
        ...typeString('x', 2000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'helxlo');
});

test('TextTimeline: ArrowRight after ArrowLeft', () => {
    const events = [
        ...typeString('hello', 0),
        ...arrow('Left', 3, 1000),
        ...arrow('Right', 1, 2000),
        ...typeString('x', 3000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'helxlo');
});

test('TextTimeline: cursor at start, insert', () => {
    const events = [
        ...typeString('world', 0),
        ...arrow('Left', 5, 1000),
        ...typeString('hello ', 2000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'hello world');
});

// ============================================================================
// Backspace at Cursor Position Tests
// ============================================================================

test('TextTimeline: backspace in middle of text', () => {
    const events = [
        ...typeString('hello', 0),
        ...arrow('Left', 2, 1000),
        ...backspace(1, 2000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'helo');
});

test('TextTimeline: multiple backspaces in middle', () => {
    const events = [
        ...typeString('abcdef', 0),
        ...arrow('Left', 2, 1000),
        ...backspace(2, 2000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'abef');
});

// ============================================================================
// Edit and Continue Typing Tests
// ============================================================================

test('TextTimeline: edit middle and continue', () => {
    const events = [
        ...typeString('hello', 0),
        ...arrow('Left', 3, 1000),     // cursor at position 2 (before 'l')
        ...backspace(1, 2000),          // delete 'l' -> 'helo', cursor at 1
        ...typeString('X', 3000),       // insert 'X' -> 'hXelo', cursor at 2
        ...arrow('Right', 3, 4000),     // move to end
        ...typeString('!', 5000)
    ];
    const result = getFinalText(events);
    // After moving left 3 from 'hello' (pos 5), cursor is at pos 2
    // Backspace deletes char at pos 1 ('e'), leaving 'hllo', cursor at 1
    // Type 'X' inserts at pos 1 -> 'hXllo'
    // Move right 3 to pos 4, type '!' -> 'hXllo!'
    assert.equal(result, 'hXllo!');
});

// ============================================================================
// Timeline State at Specific Times
// ============================================================================

test('TextTimeline: state changes over time', () => {
    const events = [
        kd('KeyH', 100), ku('KeyH', 150),
        kd('KeyI', 200), ku('KeyI', 250),
    ];
    const timeline = new TextTimeline(events);
    // baseTime is 100 (first event)

    // After first keystroke (at relative time 50, absolute time 150)
    // This is after keydown H (100) but before keydown I (200)
    const state1 = timeline.getStateAt(timeline.baseTime + 50);  // absolute 150
    assert.equal(state1.text, 'h');

    // After second keystroke (at relative time 150, absolute time 250)
    const state2 = timeline.getStateAt(timeline.baseTime + 150);  // absolute 250
    assert.equal(state2.text, 'hi');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('TextTimeline: cursor position tracking', () => {
    const events = [
        ...typeString('abc', 0),
        ...arrow('Left', 1, 1000),
    ];
    const state = getFinalState(events);
    assert.equal(state.text, 'abc');
    assert.equal(state.cursor, 2);
});

test('TextTimeline: cursor cannot go past start', () => {
    const events = [
        ...typeString('ab', 0),
        ...arrow('Left', 10, 1000),  // Try to go way past start
    ];
    const state = getFinalState(events);
    assert.equal(state.cursor, 0);
});

test('TextTimeline: cursor cannot go past end', () => {
    const events = [
        ...typeString('ab', 0),
        ...arrow('Right', 10, 1000),  // Try to go way past end
    ];
    const state = getFinalState(events);
    assert.equal(state.cursor, 2);  // Should be at position 2 (after 'b')
});

// ============================================================================
// Complex Editing Scenarios
// ============================================================================

test('TextTimeline: type, delete word, retype', () => {
    const events = [
        ...typeString('hello', 0),
        ...backspace(5, 1000),
        ...typeString('world', 2000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'world');
});

test('TextTimeline: insert in multiple positions', () => {
    const events = [
        // Type 'ac'
        ...typeString('ac', 0),
        // Move left 1 (cursor at position 1)
        ...arrow('Left', 1, 500),
        // Insert 'b' between 'a' and 'c'
        ...typeString('b', 1000)
    ];
    const result = getFinalText(events);
    assert.equal(result, 'abc');
});

test('TextTimeline: multiline editing', () => {
    // Type "line1\nline2", move left, add text
    const events = [
        ...typeString('line1\nline2', 0),
        // Move 5 left to be right after newline (position 6)
        ...arrow('Left', 5, 2000),
        ...typeString('extra', 3000)
    ];
    const result = getFinalText(events);
    // After typing, cursor is at end (11). Move left 5 = pos 6 (after newline)
    // Insert 'extra' at pos 6 -> 'line1\nextraline2'
    assert.equal(result, 'line1\nextraline2');
});

// ============================================================================
// Real Recording Verification Tests
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

test('TextTimeline: reconstruction should match final_text from real recordings', async (t) => {
    const recordingsDir = path.resolve('recordings');

    if (!fs.existsSync(recordingsDir)) {
        console.log('No recordings directory found, skipping real recording tests');
        return;
    }

    const jsonFiles = fs.readdirSync(recordingsDir).filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
        const filePath = path.join(recordingsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Skip if no final_text or events array
        if (!data.final_text || !Array.isArray(data.events)) {
            continue;
        }

        await t.test(`reconstruction matches final_text: ${file}`, () => {
            // Use all events directly - TextTimeline now handles the unified format
            const events = data.events as Array<{ ts: number; type: string; key?: string; pos?: number; delta?: number }>;
            const timeline = new TextTimeline(events as any);

            // Get the final state
            const maxTs = Math.max(...events.map(e => e.ts));
            const reconstructed = timeline.getTextAt(maxTs + 1);

            // Compare
            assert.equal(
                reconstructed,
                data.final_text,
                `Reconstructed text should match final_text for ${file}`
            );
        });
    }
});
