// The numbers the whole house is built from. One unit is one tile of the furniture kit.
export const WALL = { thick: 0.12, height: 1.3, stub: 0.16, plinth: 0.06 };
export const HOUSE = { minX: -5.5, maxX: 7.5, minZ: -2.5, maxZ: 2.5 };
export const SPLIT = { a: -2.5, b: 3 };
export const DOWN = -1.5;
export const CELLAR = { minX: 2.08, maxX: 7.5, minZ: -2.5, maxZ: 2.5 };
export const STAIR = { minX: 2.14, maxX: 2.94, topZ: -0.4, run: 0.22, rise: 0.15, steps: 10, endZ: 2.44 };
STAIR.midX = (STAIR.minX + STAIR.maxX) / 2;
STAIR.bottomZ = STAIR.topZ + STAIR.run * STAIR.steps;

export const DOORS = {
  bedroom: { from: -0.45, to: 0.25, top: 1.02 },
  workspace: { from: -1.75, to: -1.05, top: 1.02 },
  front: { from: 0.62, to: 1.14, top: 1.02 },
  backOffice: { from: 5.9, to: 6.6, top: 1.05 },
};

export const WINDOWS = {
  bedroomWest: { from: 0.3, to: 1.3, bottom: 0.5, top: 1.1 },
  bedroomBack: { from: -4.55, to: -3.65, bottom: 0.5, top: 1.1 },
  kitchen: { from: -1.4, to: -0.72, bottom: 0.62, top: 1.12 },
  workspace: { from: 5.55, to: 6.7, bottom: 0.82, top: 1.14 },
};

export const PAINT = {
  bedroom: 0xbfcbdc,
  kitchen: 0xf1e4cc,
  workspace: 0xc3d3b9,
  basement: 0xb3b0aa,
  outside: 0xece5d8,
  earth: 0x4a4038,
  cap: 0x57515e,
  trim: 0xfaf6ee,
};

// The kit's own material names, in this house's colours.
export const KIT = {
  wood: 0xd4a373,
  woodDark: 0xa9764f,
  metal: 0xc7d0d4,
  metalMedium: 0x7d8a8e,
  metalDark: 0x566065,
  metalLight: 0xf0f3f2,
  carpet: 0xd66b5c,
  carpetDarker: 0xb5544a,
  carpetWhite: 0xf6f3ec,
  plant: 0x5aa867,
  glass: 0xbfe3ee,
  lamp: 0xfff1cf,
  _defaultMat: 0xf3efe8,
};

export const INK = {
  wood: 0xd4a373,
  woodDark: 0x8f6243,
  walnut: 0x6f4b35,
  steel: 0x596069,
  steelDark: 0x33373f,
  chrome: 0xc9d1d6,
  black: 0x24262b,
  white: 0xf7f4ee,
  paper: 0xfffdf8,
  rubber: 0x2c2e33,
  blue: 0x4f7fd0,
  teal: 0x3f8f8a,
  coral: 0xd66b5c,
  mustard: 0xe0a93b,
  green: 0x5aa867,
  leaf: 0x4c9a5a,
  leafDark: 0x3d7f4c,
  bark: 0x7a5a42,
  stone: 0xb9b4aa,
  brass: 0xc9a24a,
  red: 0xc8463c,
  purple: 0x8a6fc0,
};
