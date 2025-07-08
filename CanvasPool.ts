// CanvasPool.ts
// Utility for pooling and reusing offscreen canvases

class CanvasPool {
  private static pool: (HTMLCanvasElement | OffscreenCanvas)[] = [];

  static getCanvas(
    width: number,
    height: number,
  ): HTMLCanvasElement | OffscreenCanvas {
    let canvas: HTMLCanvasElement | OffscreenCanvas | undefined =
      CanvasPool.pool.pop();
    if (!canvas) {
      if (typeof window !== 'undefined' && 'OffscreenCanvas' in window) {
        // @ts-ignore
        canvas = new window.OffscreenCanvas(width, height);
      } else {
        canvas = document.createElement('canvas');
      }
    }
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  static releaseCanvas(canvas: HTMLCanvasElement | OffscreenCanvas) {
    CanvasPool.pool.push(canvas);
  }

  static clear() {
    CanvasPool.pool = [];
  }
}

export default CanvasPool;
