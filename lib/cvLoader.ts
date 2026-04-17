// OpenCV.js attaches `cv` globally at runtime; we access it via (window as any).cv.
let loaded: Promise<any> | null = null;

const CDN = 'https://docs.opencv.org/4.x/opencv.js';

export function loadOpenCv(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV requires a browser environment'));
  }
  if ((window as any).cv?.Mat) return Promise.resolve((window as any).cv);
  if (loaded) return loaded;

  loaded = new Promise((resolve, reject) => {
    const script = document.createElement('script') as HTMLScriptElement;
    script.src = CDN;
    script.async = true;
    script.onload = () => {
      // OpenCV fires onload before WASM runtime finishes initializing.
      const poll = () => {
        const cv = (window as any).cv;
        if (cv?.Mat) return resolve(cv);
        setTimeout(poll, 50);
      };
      poll();
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
  return loaded;
}

// Test-only reset
export function __resetCvForTest(): void {
  loaded = null;
  if (typeof window !== 'undefined') delete (window as any).cv;
}
