declare module "gifenc" {
  export type GifPalette = number[][];

  export interface GifEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export interface GifFrameOptions {
    palette?: GifPalette | null;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface GifEncoderInstance {
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOptions): void;
    reset(): void;
  }

  export function GIFEncoder(options?: GifEncoderOptions): GifEncoderInstance;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: object): GifPalette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: string): Uint8Array;
}
