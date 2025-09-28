// Layout data for Minecraft skin rendering
// Based on the original skinLayout.js but modernized for TypeScript

export interface SkinRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkinPart {
  l: SkinRectangle;
  r: SkinRectangle;
  u: SkinRectangle;
  d: SkinRectangle;
  f: SkinRectangle;
  b: SkinRectangle;
}

export interface SkinVersion {
  head: [SkinPart, SkinPart];
  torso: [SkinPart, SkinPart];
  armR: [SkinPart, SkinPart];
  armRS: [SkinPart, SkinPart];
  armL: [SkinPart, SkinPart];
  armLS: [SkinPart, SkinPart];
  legR: [SkinPart, SkinPart];
  legL: [SkinPart, SkinPart];
}

export const skinLayout: SkinVersion[] = [
  // Version 0 (32x32 skins)
  {
    head: [
      {
        l: { x: 16, y: 8, w: 8, h: 8 },
        r: { x: 0, y: 8, w: 8, h: 8 },
        u: { x: 8, y: 0, w: 8, h: 8 },
        d: { x: 16, y: 7, w: 8, h: -8 },
        f: { x: 8, y: 8, w: 8, h: 8 },
        b: { x: 24, y: 8, w: 8, h: 8 },
      },
      {
        l: { x: 48, y: 8, w: 8, h: 8 },
        r: { x: 32, y: 8, w: 8, h: 8 },
        u: { x: 40, y: 0, w: 8, h: 8 },
        d: { x: 48, y: 7, w: 8, h: -8 },
        f: { x: 40, y: 8, w: 8, h: 8 },
        b: { x: 56, y: 8, w: 8, h: 8 },
      },
    ],
    torso: [
      {
        l: { x: 28, y: 20, w: 4, h: 12 },
        r: { x: 16, y: 20, w: 4, h: 12 },
        u: { x: 20, y: 16, w: 8, h: 4 },
        d: { x: 28, y: 19, w: 8, h: -4 },
        f: { x: 20, y: 20, w: 8, h: 12 },
        b: { x: 32, y: 20, w: 8, h: 12 },
      },
    ],
    armR: [
      {
        l: { x: 48, y: 20, w: 4, h: 12 },
        r: { x: 40, y: 20, w: 4, h: 12 },
        u: { x: 44, y: 16, w: 4, h: 4 },
        d: { x: 48, y: 19, w: 4, h: -4 },
        f: { x: 44, y: 20, w: 4, h: 12 },
        b: { x: 52, y: 20, w: 4, h: 12 },
      },
    ],
    armRS: [
      {
        l: { x: 47, y: 20, w: 4, h: 12 },
        r: { x: 40, y: 20, w: 4, h: 12 },
        u: { x: 44, y: 16, w: 3, h: 4 },
        d: { x: 47, y: 19, w: 3, h: -4 },
        f: { x: 44, y: 20, w: 3, h: 12 },
        b: { x: 51, y: 20, w: 3, h: 12 },
      },
    ],
    armL: [
      {
        l: { x: 43, y: 20, w: -4, h: 12 },
        r: { x: 51, y: 20, w: -4, h: 12 },
        u: { x: 47, y: 16, w: -4, h: 4 },
        d: { x: 51, y: 19, w: -4, h: -4 },
        f: { x: 47, y: 20, w: -4, h: 12 },
        b: { x: 55, y: 20, w: -4, h: 12 },
      },
    ],
    armLS: [
      {
        l: { x: 43, y: 20, w: -4, h: 12 },
        r: { x: 50, y: 20, w: -4, h: 12 },
        u: { x: 46, y: 16, w: -3, h: 4 },
        d: { x: 49, y: 19, w: -3, h: -4 },
        f: { x: 46, y: 20, w: -3, h: 12 },
        b: { x: 53, y: 20, w: -3, h: 12 },
      },
    ],
    legR: [
      {
        l: { x: 8, y: 20, w: 4, h: 12 },
        r: { x: 0, y: 20, w: 4, h: 12 },
        u: { x: 4, y: 16, w: 4, h: 4 },
        d: { x: 8, y: 19, w: 4, h: -4 },
        f: { x: 4, y: 20, w: 4, h: 12 },
        b: { x: 12, y: 20, w: 4, h: 12 },
      },
    ],
    legL: [
      {
        l: { x: 3, y: 20, w: -4, h: 12 },
        r: { x: 11, y: 20, w: -4, h: 12 },
        u: { x: 7, y: 16, w: -4, h: 4 },
        d: { x: 11, y: 19, w: -4, h: -4 },
        f: { x: 7, y: 20, w: -4, h: 12 },
        b: { x: 15, y: 20, w: -4, h: 12 },
      },
    ],
  },
  // Version 1 (64x64 skins)
  {
    head: [
      {
        l: { x: 16, y: 8, w: 8, h: 8 },
        r: { x: 0, y: 8, w: 8, h: 8 },
        u: { x: 8, y: 0, w: 8, h: 8 },
        d: { x: 16, y: 7, w: 8, h: -8 },
        f: { x: 8, y: 8, w: 8, h: 8 },
        b: { x: 24, y: 8, w: 8, h: 8 },
      },
      {
        l: { x: 48, y: 8, w: 8, h: 8 },
        r: { x: 32, y: 8, w: 8, h: 8 },
        u: { x: 40, y: 0, w: 8, h: 8 },
        d: { x: 48, y: 7, w: 8, h: -8 },
        f: { x: 40, y: 8, w: 8, h: 8 },
        b: { x: 56, y: 8, w: 8, h: 8 },
      },
    ],
    torso: [
      {
        l: { x: 28, y: 20, w: 4, h: 12 },
        r: { x: 16, y: 20, w: 4, h: 12 },
        u: { x: 20, y: 16, w: 8, h: 4 },
        d: { x: 28, y: 19, w: 8, h: -4 },
        f: { x: 20, y: 20, w: 8, h: 12 },
        b: { x: 32, y: 20, w: 8, h: 12 },
      },
      {
        l: { x: 28, y: 36, w: 4, h: 12 },
        r: { x: 16, y: 36, w: 4, h: 12 },
        u: { x: 20, y: 32, w: 8, h: 4 },
        d: { x: 28, y: 35, w: 8, h: -4 },
        f: { x: 20, y: 36, w: 8, h: 12 },
        b: { x: 32, y: 36, w: 8, h: 12 },
      },
    ],
    armR: [
      {
        l: { x: 48, y: 20, w: 4, h: 12 },
        r: { x: 40, y: 20, w: 4, h: 12 },
        u: { x: 44, y: 16, w: 4, h: 4 },
        d: { x: 48, y: 19, w: 4, h: -4 },
        f: { x: 44, y: 20, w: 4, h: 12 },
        b: { x: 52, y: 20, w: 4, h: 12 },
      },
      {
        l: { x: 48, y: 36, w: 4, h: 12 },
        r: { x: 40, y: 36, w: 4, h: 12 },
        u: { x: 44, y: 32, w: 4, h: 4 },
        d: { x: 48, y: 35, w: 4, h: -4 },
        f: { x: 44, y: 36, w: 4, h: 12 },
        b: { x: 52, y: 36, w: 4, h: 12 },
      },
    ],
    armRS: [
      {
        l: { x: 47, y: 20, w: 4, h: 12 },
        r: { x: 40, y: 20, w: 4, h: 12 },
        u: { x: 44, y: 16, w: 3, h: 4 },
        d: { x: 47, y: 19, w: 3, h: -4 },
        f: { x: 44, y: 20, w: 3, h: 12 },
        b: { x: 51, y: 20, w: 3, h: 12 },
      },
      {
        l: { x: 47, y: 36, w: 4, h: 12 },
        r: { x: 40, y: 36, w: 4, h: 12 },
        u: { x: 44, y: 32, w: 3, h: 4 },
        d: { x: 47, y: 35, w: 3, h: -4 },
        f: { x: 44, y: 36, w: 3, h: 12 },
        b: { x: 51, y: 36, w: 3, h: 12 },
      },
    ],
    armL: [
      {
        l: { x: 40, y: 52, w: 4, h: 12 },
        r: { x: 32, y: 52, w: 4, h: 12 },
        u: { x: 36, y: 48, w: 4, h: 4 },
        d: { x: 40, y: 51, w: 4, h: -4 },
        f: { x: 36, y: 52, w: 4, h: 12 },
        b: { x: 44, y: 52, w: 4, h: 12 },
      },
      {
        l: { x: 56, y: 52, w: 4, h: 12 },
        r: { x: 48, y: 52, w: 4, h: 12 },
        u: { x: 52, y: 48, w: 4, h: 4 },
        d: { x: 56, y: 51, w: 4, h: -4 },
        f: { x: 52, y: 52, w: 4, h: 12 },
        b: { x: 60, y: 52, w: 4, h: 12 },
      },
    ],
    armLS: [
      {
        l: { x: 39, y: 52, w: 4, h: 12 },
        r: { x: 32, y: 52, w: 4, h: 12 },
        u: { x: 36, y: 48, w: 3, h: 4 },
        d: { x: 39, y: 51, w: 3, h: -4 },
        f: { x: 36, y: 52, w: 3, h: 12 },
        b: { x: 43, y: 52, w: 3, h: 12 },
      },
      {
        l: { x: 55, y: 52, w: 4, h: 12 },
        r: { x: 48, y: 52, w: 4, h: 12 },
        u: { x: 52, y: 48, w: 3, h: 4 },
        d: { x: 55, y: 51, w: 3, h: -4 },
        f: { x: 52, y: 52, w: 3, h: 12 },
        b: { x: 59, y: 52, w: 3, h: 12 },
      },
    ],
    legR: [
      {
        l: { x: 8, y: 20, w: 4, h: 12 },
        r: { x: 0, y: 20, w: 4, h: 12 },
        u: { x: 4, y: 16, w: 4, h: 4 },
        d: { x: 8, y: 19, w: 4, h: -4 },
        f: { x: 4, y: 20, w: 4, h: 12 },
        b: { x: 12, y: 20, w: 4, h: 12 },
      },
      {
        l: { x: 8, y: 36, w: 4, h: 12 },
        r: { x: 0, y: 36, w: 4, h: 12 },
        u: { x: 4, y: 32, w: 4, h: 4 },
        d: { x: 8, y: 35, w: 4, h: -4 },
        f: { x: 4, y: 36, w: 4, h: 12 },
        b: { x: 12, y: 36, w: 4, h: 12 },
      },
    ],
    legL: [
      {
        l: { x: 24, y: 52, w: 4, h: 12 },
        r: { x: 16, y: 52, w: 4, h: 12 },
        u: { x: 20, y: 48, w: 4, h: 4 },
        d: { x: 24, y: 51, w: 4, h: -4 },
        f: { x: 20, y: 52, w: 4, h: 12 },
        b: { x: 28, y: 52, w: 4, h: 12 },
      },
      {
        l: { x: 8, y: 52, w: 4, h: 12 },
        r: { x: 0, y: 52, w: 4, h: 12 },
        u: { x: 4, y: 48, w: 4, h: 4 },
        d: { x: 8, y: 51, w: 4, h: -4 },
        f: { x: 4, y: 52, w: 4, h: 12 },
        b: { x: 12, y: 52, w: 4, h: 12 },
      },
    ],
  },
];
