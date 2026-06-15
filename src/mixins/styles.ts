import { ColorSource, Graphics, TextOptions } from "pixi.js";

export function applyGenericBoxStyle(
  gfx: Graphics,
  borderColor: ColorSource = 0x78faae,
) {
  return gfx
    .setStrokeStyle({
      width: 2,
      color: borderColor,
      cap: "square",
      join: "miter",
    })
    .setFillStyle({ color: 0x070d0b, alpha: 0.92 });
}

export function drawPixelBox(
  gfx: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  borderColor: ColorSource | undefined = 0x78faae,
) {
  const color = borderColor ?? 0x78faae;
  gfx
    .setFillStyle({ color: 0x000000, alpha: 0.45 })
    .rect(x + 3, y + 3, w, h)
    .fill()
    .setFillStyle({ color: 0x070d0b, alpha: 0.92 })
    .rect(x, y, w, h)
    .fill()
    .setStrokeStyle({ width: 2, color, cap: "square", join: "miter" })
    .rect(x, y, w, h)
    .stroke()
    .setStrokeStyle({
      width: 1,
      color: color,
      alpha: 0.35,
      cap: "square",
      join: "miter",
    })
    .moveTo(x + 2, y + h - 2)
    .lineTo(x + 2, y + 2)
    .lineTo(x + w - 2, y + 2)
    .stroke();
}

export const DefaultTextStyle = {
  fontFamily: "Monogram",
  fontWeight: "400",
  fontSize: 28,
  fill: 0xffffff,
  align: "left",
  dropShadow: {
    color: 0x000000,
    blur: 0,
    angle: Math.PI / 4,
    distance: 2,
  },
} as TextOptions["style"];

export const LargeTextStyle = {
  fontFamily: "Monogram",
  fontWeight: "400",
  fontSize: 56,
  fill: 0xffffff,
  align: "left",
  dropShadow: {
    color: 0x000000,
    blur: 0,
    angle: Math.PI / 4,
    distance: 3,
  },
} as TextOptions["style"];
