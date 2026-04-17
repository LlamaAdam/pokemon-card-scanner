import type { OpenCv } from '@/lib/opencvTypes';

declare global {
  interface Window {
    // Populated at runtime by the OpenCV.js CDN script (see lib/cvLoader.ts).
    cv?: OpenCv;
    // Cross-page blob URL hand-off from the camera-capture landing to /scan.
    __capturedBlobUrl?: string;
  }

  // eslint-disable-next-line no-var
  var __now: number | undefined;
}

export {};
