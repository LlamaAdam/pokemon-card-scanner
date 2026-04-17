// Minimal surface types for OpenCV.js. The CDN build ships no .d.ts,
// so we model only the call-sites the app actually touches.

export interface OpenCvMat {
  delete(): void;
}

export interface OpenCvMatVector {
  size(): number;
  get(i: number): OpenCvMat;
  delete(): void;
}

export interface OpenCvRect { x: number; y: number; width: number; height: number; }

export interface OpenCv {
  Mat: new () => OpenCvMat;
  MatVector: new () => OpenCvMatVector;
  imread(canvas: HTMLCanvasElement): OpenCvMat;
  cvtColor(src: OpenCvMat, dst: OpenCvMat, code: number): void;
  Canny(src: OpenCvMat, dst: OpenCvMat, threshold1: number, threshold2: number): void;
  findContours(
    image: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number,
  ): void;
  boundingRect(contour: OpenCvMat): OpenCvRect;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
}
