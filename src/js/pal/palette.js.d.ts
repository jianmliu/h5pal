export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

export interface PaletteModule {
  get(index: number, clone?: boolean): PaletteColor[] | null;
  init(pat: unknown): void;
}

declare const palette: PaletteModule;

export default palette;
