import type { KeystrokeEvent } from '$lib/text/textTimeline';

/**
 * Common recording data structure used across components
 */
export interface RecordingLike {
    start_timestamp: number;
    end_timestamp?: number;
    keystrokes: KeystrokeEvent[];
    allEvents?: unknown[];
    filename?: string;
}
