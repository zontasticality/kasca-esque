/**
 * Shared media stream singleton to avoid duplicate microphone requests
 */

let sharedStream: MediaStream | null = null;
let refCount = 0;
let initPromise: Promise<MediaStream> | null = null;

/**
 * Acquire a reference to the shared media stream.
 * Call releaseMediaStream when done to properly clean up.
 */
export async function acquireMediaStream(): Promise<MediaStream> {
    refCount++;

    if (sharedStream) {
        return sharedStream;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = navigator.mediaDevices.getUserMedia({ audio: true });

    try {
        sharedStream = await initPromise;
        return sharedStream;
    } catch (error) {
        refCount--;
        initPromise = null;
        throw error;
    }
}

/**
 * Release a reference to the shared media stream.
 * The stream is stopped when all references are released.
 */
export function releaseMediaStream(): void {
    refCount--;

    if (refCount <= 0 && sharedStream) {
        sharedStream.getTracks().forEach((track) => track.stop());
        sharedStream = null;
        initPromise = null;
        refCount = 0;
    }
}

/**
 * Check if a shared media stream is currently available.
 */
export function hasMediaStream(): boolean {
    return sharedStream !== null;
}
