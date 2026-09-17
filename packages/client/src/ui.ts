export const CANVAS_W = 320;
export const CANVAS_H = 240;

/** 1982 arcade palette. */
export const PAL = {
  black: '#000000',
  navy: '#1d2b53',
  green: '#008751',
  brown: '#ab5236',
  white: '#fffff5',
  red: '#ff004d',
  orange: '#ffa300',
  cyan: '#2de2e6',
  darkred: '#9d0000',
  yellow: '#f7e766',
  gray: '#c2c3c7',
  purple: '#4b3f72',
  magenta: '#e03a8a',
  blue: '#204a8a',
  lime: '#2ee66b',
  dim: '#10131f',
};

export const PLAYER_COLORS = [PAL.lime, PAL.red, PAL.cyan, PAL.yellow];

export const FONT = '"Hiragino Kaku Gothic ProN", "MS Gothic", monospace';

export function px(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 8,
  color = PAL.white,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, Math.round(x), Math.round(y));
}

export const blink = (tMs: number, period = 800): boolean => Math.floor(tMs / period) % 2 === 0;
