/**
 * Generic binary search to find the last state with time <= timestamp.
 * Returns -1 if no such state exists.
 */
export function findStateByTime<T extends { time: number }>(
    states: readonly T[],
    timestamp: number
): number {
    let low = 0;
    let high = states.length - 1;
    let result = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midTime = states[mid].time;
        if (midTime <= timestamp) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return result;
}
