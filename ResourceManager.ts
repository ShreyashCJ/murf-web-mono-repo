// ResourceManager.ts
// Centralized utility for tracking and cleaning up resources to prevent memory leaks

class ResourceManager {
  private static audioRefs: WeakMap<object, boolean> = new WeakMap();
  private static blobUrls: Set<string> = new Set();
  private static animationFrames: Set<number> = new Set();
  private static intervals: Set<number> = new Set();
  private static timeouts: Set<number> = new Set();

  // Audio elements (object = HTMLAudioElement or ref)
  static registerAudio(audio: object) {
    if (audio) ResourceManager.audioRefs.set(audio, true);
  }
  static unregisterAudio(audio: object) {
    if (audio) ResourceManager.audioRefs.delete(audio);
  }

  // Blob URLs
  static registerBlobUrl(url: string) {
    if (url) ResourceManager.blobUrls.add(url);
  }
  static unregisterBlobUrl(url: string) {
    if (url) ResourceManager.blobUrls.delete(url);
  }

  // Animation Frames
  static registerAnimationFrame(id: number) {
    ResourceManager.animationFrames.add(id);
  }
  static unregisterAnimationFrame(id: number) {
    ResourceManager.animationFrames.delete(id);
  }

  // Intervals
  static registerInterval(id: number) {
    ResourceManager.intervals.add(id);
  }
  static unregisterInterval(id: number) {
    ResourceManager.intervals.delete(id);
  }

  // Timeouts
  static registerTimeout(id: number) {
    ResourceManager.timeouts.add(id);
  }
  static unregisterTimeout(id: number) {
    ResourceManager.timeouts.delete(id);
  }

  // Cleanup all resources
  static cleanupAll() {
    // Clean up audio elements
    ResourceManager.audioRefs = new WeakMap(); // Let GC handle DOM/audio

    // Clean up blob URLs
    for (const url of ResourceManager.blobUrls) {
      try {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      } catch {}
    }
    ResourceManager.blobUrls.clear();

    // Cancel animation frames
    for (const id of ResourceManager.animationFrames) {
      cancelAnimationFrame(id);
    }
    ResourceManager.animationFrames.clear();

    // Clear intervals
    for (const id of ResourceManager.intervals) {
      clearInterval(id);
    }
    ResourceManager.intervals.clear();

    // Clear timeouts
    for (const id of ResourceManager.timeouts) {
      clearTimeout(id);
    }
    ResourceManager.timeouts.clear();
  }
}

export default ResourceManager;
