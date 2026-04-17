import type { OpenCv } from './opencvTypes';

// OpenCV.js attaches `cv` globally at runtime; we access it via window.cv.
let loaded: Promise<OpenCv> | null = null;

const CDN = 'https://docs.opencv.org/4.x/opencv.js';

export function loadOpenCv(): Promise<OpenCv> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV requires a browser environment'));
  }
  if (window.cv?.Mat) return Promise.resolve(window.cv);
  if (loaded) return loaded;

  loaded = new Promise<OpenCv>((resolve, reject) => {
    const script = document.createElement('script') as HTMLScriptElement;
    script.src = CDN;
    script.async = true;
    script.onload = () => {
      // OpenCV fires onload before WASM runtime finishes initializing.
      // Cap the wait at ~10s (200 × 50ms) so a silent WASM failure doesn't
      // leave callers with a forever-pending promise.
      let attempts = 0;
      const poll = () => {
        const cv = window.cv;
        if (cv?.Mat) return resolve(cv);
        if (++attempts > 200) {
          loaded = null;
          return reject(new Error('OpenCV.js runtime init timeout'));
        }
        setTimeout(poll, 50);
      };
      poll();
    };
    script.onerror = () => {
      loaded = null;
      reject(new Error('Failed to load OpenCV.js'));
    };
    document.head.appendChild(script);
  });
  return loaded;
}

// Test-only reset
export function __resetCvForTest(): void {
  loaded = null;
  if (typeof window !== 'undefined') delete window.cv;
}
