declare module "headless-gl" {
  interface GLContext {
    [key: string]: any;
  }

  function gl(
    width: number,
    height: number,
    options?: {
      preserveDrawingBuffer?: boolean;
      antialias?: boolean;
      depth?: boolean;
      stencil?: boolean;
      alpha?: boolean;
      premultipliedAlpha?: boolean;
      failIfMajorPerformanceCaveat?: boolean;
      powerPreference?: "default" | "high-performance" | "low-power";
    }
  ): GLContext;

  export = gl;
}

declare module "@napi-rs/canvas" {
  export function createCanvas(width: number, height: number): any;
  export function loadImage(src: string): any;
  export function registerFont(path: string, options: { family: string }): void;
}

declare module "node-canvas-webgl" {
  export function createCanvas(width: number, height: number): any;
  export function loadImage(src: string): any;
  export function registerFont(path: string, options: { family: string }): void;
}
