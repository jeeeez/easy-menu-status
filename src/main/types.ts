export enum WindowSizeAlias {
  FULLSCREEN = 'fullscreen',
  MAXIMIZED = 'maximized',
  MINIMIZED = 'minimized',
  LEFT = 'left',
  RIGHT = 'right',
  TOP = 'top',
  BOTTOM = 'bottom',
}
export interface WindowSize {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fullscreen?: boolean;
}

export type WindowSizeProp = WindowSizeAlias | WindowSize;
