import type { FlowParams, LookParams, RenderParams, TopologyParams } from "./types";

export interface ReferencePoint {
  x: number;
  y: number;
}

export interface ReferenceFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReferenceVoidNormalized {
  x: number;
  y: number;
  radius: number;
  influence: number;
  spin: number;
}

export interface ReferenceChannelNormalized {
  points: ReferencePoint[];
  radius: number;
  pull: number;
  flow: number;
  phase: number;
}

export interface ReferenceSpawnBandNormalized {
  points: ReferencePoint[];
  width: number;
  weight: number;
  jitter: number;
}

export interface ReferenceVoid {
  x: number;
  y: number;
  baseRadius: number;
  influence: number;
  spin: number;
}

export interface ReferenceChannel {
  points: ReferencePoint[];
  radius: number;
  pull: number;
  flow: number;
  phase: number;
}

export interface ReferenceSpawnBand {
  points: ReferencePoint[];
  width: number;
  weight: number;
  jitter: number;
}

export interface ReferenceLayout {
  frameRect: ReferenceFrameRect;
  frameWidth: number;
  frameHeight: number;
  halfWidth: number;
  halfHeight: number;
  voids: ReferenceVoid[];
  channels: ReferenceChannel[];
  spawnBands: ReferenceSpawnBand[];
}

export interface ReferenceDefaults {
  flow: FlowParams;
  topology: TopologyParams;
  look: LookParams;
  render: RenderParams;
}

export interface SavedReferenceVoid {
  x: number;
  y: number;
  baseRadius: number;
  influence: number;
}

export interface SavedReferenceLayout {
  voids: SavedReferenceVoid[];
}

export const REFERENCE_FRAME_WIDTH = 4;
export const REFERENCE_FRAME_HEIGHT = 7;
export const REFERENCE_LAYOUT_STORAGE_KEY = "vectorfields.reference-layout.v1";

const frameRectNormalized: ReferenceFrameRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

const voidsNormalized: ReferenceVoidNormalized[] = [
  { x: 0.15, y: 0.89, radius: 0.033, influence: 0.12, spin: 1 },
  { x: 0.285, y: 0.89, radius: 0.032, influence: 0.12, spin: -1 },
  { x: 0.425, y: 0.89, radius: 0.031, influence: 0.115, spin: 1 },
  { x: 0.575, y: 0.89, radius: 0.031, influence: 0.115, spin: -1 },
  { x: 0.715, y: 0.89, radius: 0.032, influence: 0.12, spin: 1 },
  { x: 0.85, y: 0.89, radius: 0.033, influence: 0.12, spin: -1 },

  { x: 0.435, y: 0.805, radius: 0.03, influence: 0.105, spin: -1 },
  { x: 0.565, y: 0.805, radius: 0.03, influence: 0.105, spin: 1 },

  { x: 0.445, y: 0.715, radius: 0.029, influence: 0.1, spin: 1 },
  { x: 0.555, y: 0.715, radius: 0.029, influence: 0.1, spin: -1 },
  { x: 0.445, y: 0.625, radius: 0.028, influence: 0.096, spin: -1 },
  { x: 0.555, y: 0.625, radius: 0.028, influence: 0.096, spin: 1 },
  { x: 0.445, y: 0.535, radius: 0.027, influence: 0.094, spin: 1 },
  { x: 0.555, y: 0.535, radius: 0.027, influence: 0.094, spin: -1 },
  { x: 0.445, y: 0.445, radius: 0.026, influence: 0.09, spin: -1 },
  { x: 0.555, y: 0.445, radius: 0.026, influence: 0.09, spin: 1 },
  { x: 0.445, y: 0.355, radius: 0.025, influence: 0.086, spin: 1 },
  { x: 0.555, y: 0.355, radius: 0.025, influence: 0.086, spin: -1 },

  { x: 0.29, y: 0.72, radius: 0.031, influence: 0.108, spin: -1 },
  { x: 0.71, y: 0.72, radius: 0.031, influence: 0.108, spin: 1 },
  { x: 0.275, y: 0.625, radius: 0.03, influence: 0.106, spin: 1 },
  { x: 0.725, y: 0.625, radius: 0.03, influence: 0.106, spin: -1 },
  { x: 0.305, y: 0.53, radius: 0.029, influence: 0.104, spin: -1 },
  { x: 0.695, y: 0.53, radius: 0.029, influence: 0.104, spin: 1 },
  { x: 0.275, y: 0.435, radius: 0.028, influence: 0.1, spin: 1 },
  { x: 0.725, y: 0.435, radius: 0.028, influence: 0.1, spin: -1 },
  { x: 0.31, y: 0.34, radius: 0.026, influence: 0.096, spin: -1 },
  { x: 0.69, y: 0.34, radius: 0.026, influence: 0.096, spin: 1 },
  { x: 0.28, y: 0.20, radius: 0.024, influence: 0.088, spin: 1 },
  { x: 0.72, y: 0.20, radius: 0.024, influence: 0.088, spin: -1 },

  { x: 0.445, y: 0.14, radius: 0.022, influence: 0.08, spin: -1 },
  { x: 0.555, y: 0.14, radius: 0.022, influence: 0.08, spin: 1 },
];

const channelsNormalized: ReferenceChannelNormalized[] = [
  {
    points: [
      { x: 0.487, y: 0.16 },
      { x: 0.48, y: 0.28 },
      { x: 0.492, y: 0.40 },
      { x: 0.485, y: 0.52 },
      { x: 0.495, y: 0.64 },
      { x: 0.49, y: 0.79 },
    ],
    radius: 0.065,
    pull: 1.1,
    flow: 1.25,
    phase: 0.15,
  },
  {
    points: [
      { x: 0.513, y: 0.16 },
      { x: 0.52, y: 0.28 },
      { x: 0.508, y: 0.40 },
      { x: 0.515, y: 0.52 },
      { x: 0.505, y: 0.64 },
      { x: 0.51, y: 0.79 },
    ],
    radius: 0.065,
    pull: 1.1,
    flow: 1.25,
    phase: -0.15,
  },
  {
    points: [
      { x: 0.40, y: 0.17 },
      { x: 0.34, y: 0.24 },
      { x: 0.43, y: 0.33 },
      { x: 0.35, y: 0.44 },
      { x: 0.44, y: 0.54 },
      { x: 0.35, y: 0.64 },
      { x: 0.44, y: 0.74 },
      { x: 0.42, y: 0.82 },
    ],
    radius: 0.08,
    pull: 1.28,
    flow: 1.48,
    phase: 0.55,
  },
  {
    points: [
      { x: 0.60, y: 0.17 },
      { x: 0.66, y: 0.24 },
      { x: 0.57, y: 0.33 },
      { x: 0.65, y: 0.44 },
      { x: 0.56, y: 0.54 },
      { x: 0.65, y: 0.64 },
      { x: 0.56, y: 0.74 },
      { x: 0.58, y: 0.82 },
    ],
    radius: 0.08,
    pull: 1.28,
    flow: 1.48,
    phase: -0.55,
  },
  {
    points: [
      { x: 0.27, y: 0.12 },
      { x: 0.22, y: 0.22 },
      { x: 0.31, y: 0.33 },
      { x: 0.23, y: 0.45 },
      { x: 0.32, y: 0.57 },
      { x: 0.23, y: 0.69 },
      { x: 0.31, y: 0.80 },
    ],
    radius: 0.085,
    pull: 1.06,
    flow: 1.34,
    phase: 1.1,
  },
  {
    points: [
      { x: 0.73, y: 0.12 },
      { x: 0.78, y: 0.22 },
      { x: 0.69, y: 0.33 },
      { x: 0.77, y: 0.45 },
      { x: 0.68, y: 0.57 },
      { x: 0.77, y: 0.69 },
      { x: 0.69, y: 0.80 },
    ],
    radius: 0.085,
    pull: 1.06,
    flow: 1.34,
    phase: -1.1,
  },
  {
    points: [
      { x: 0.18, y: 0.90 },
      { x: 0.29, y: 0.83 },
      { x: 0.39, y: 0.77 },
      { x: 0.46, y: 0.71 },
    ],
    radius: 0.075,
    pull: 0.86,
    flow: 1.05,
    phase: 2.0,
  },
  {
    points: [
      { x: 0.82, y: 0.90 },
      { x: 0.71, y: 0.83 },
      { x: 0.61, y: 0.77 },
      { x: 0.54, y: 0.71 },
    ],
    radius: 0.075,
    pull: 0.86,
    flow: 1.05,
    phase: -2.0,
  },
];

const spawnBandsNormalized: ReferenceSpawnBandNormalized[] = channelsNormalized.map((channel, index) => ({
  points: channel.points,
  width: channel.radius * (index < 2 ? 0.7 : 0.82),
  weight: index < 2 ? 1.15 : 1,
  jitter: index < 2 ? 0.012 : 0.02,
}));

export const referenceDefaults: ReferenceDefaults = {
  flow: {
    particleCount: 2000,
    trailLength: 128,
    integrationStep: 0.009,
    particleLife: 12,
    respawnJitter: 0.08,
    loopSpeed: 0.78,
    loopAmount: 0.15,
  },
  topology: {
    voidRadiusScale: 1.23,
    voidRepel: 0.5,
    ringVorticity: 1.98,
    ringWidth: 0.076,
    channelPull: 0.38,
    channelFlow: 0.33,
    sideInflow: 1.67,
    spineStrength: 0.66,
    edgeFade: 0.51,
    backgroundCurl: 0.48,
    backgroundNoiseScale: 0.34,
    backgroundNoiseSpeed: 3,
  },
  look: {
    backgroundColor: "#000000",
    lineColor: "#575757",
    frameColor: "#ffffff",
    headCircleColor: "#f0f0f0",
    showHeadCircles: true,
    headCircleSize: 2.1,
    headCircleOpacity: 0.95,
    headCircleThickness: 0.22,
    sphereColor: "#3b3b3b",
    sphereBrightness: 1.02,
    sphereContrast: 1.46,
    sphereRoughness: 0.7,
    sphereMetalness: 1,
    haloOpacity: 0.48,
    haloSoftness: 1,
    showTrails: true,
    feedbackTrail: false,
    feedbackDamp: 0.72,
    lineOpacity: 0.19,
    lineBrightness: 0.75,
    pointSize: 1.18,
    frameOpacity: 0.43,
    contrast: 1.3,
    grainDensity: 1,
  },
  render: {
    pixelRatioCap: 1,
    fpsLimit: "unlimited",
  },
};

const toWorldPoint = (point: ReferencePoint, frameWidth: number, frameHeight: number): ReferencePoint => ({
  x: (point.x - 0.5) * frameWidth,
  y: (0.5 - point.y) * frameHeight,
});

export const createReferenceLayout = (
  frameWidth = REFERENCE_FRAME_WIDTH,
  frameHeight = REFERENCE_FRAME_HEIGHT,
): ReferenceLayout => {
  const halfWidth = frameWidth * 0.5;
  const halfHeight = frameHeight * 0.5;

  return {
    frameRect: { ...frameRectNormalized },
    frameWidth,
    frameHeight,
    halfWidth,
    halfHeight,
    voids: voidsNormalized.map((item) => ({
      x: (item.x - 0.5) * frameWidth,
      y: (0.5 - item.y) * frameHeight,
      baseRadius: item.radius * frameWidth,
      influence: item.influence * frameWidth,
      spin: item.spin,
    })),
    channels: channelsNormalized.map((item) => ({
      points: item.points.map((point) => toWorldPoint(point, frameWidth, frameHeight)),
      radius: item.radius * frameWidth,
      pull: item.pull,
      flow: item.flow,
      phase: item.phase,
    })),
    spawnBands: spawnBandsNormalized.map((item) => ({
      points: item.points.map((point) => toWorldPoint(point, frameWidth, frameHeight)),
      width: item.width * frameWidth,
      weight: item.weight,
      jitter: item.jitter * frameWidth,
    })),
  };
};

export const captureVoidLayout = (layout: ReferenceLayout): SavedReferenceLayout => ({
  voids: layout.voids.map((item) => ({
    x: item.x,
    y: item.y,
    baseRadius: item.baseRadius,
    influence: item.influence,
  })),
});

export const restoreVoidLayout = (layout: ReferenceLayout, saved: SavedReferenceLayout): boolean => {
  if (!saved || !Array.isArray(saved.voids) || saved.voids.length !== layout.voids.length) {
    return false;
  }

  for (let i = 0; i < layout.voids.length; i += 1) {
    const source = saved.voids[i];
    const target = layout.voids[i];
    if (
      !source ||
      !Number.isFinite(source.x) ||
      !Number.isFinite(source.y) ||
      !Number.isFinite(source.baseRadius) ||
      !Number.isFinite(source.influence)
    ) {
      return false;
    }
    target.x = source.x;
    target.y = source.y;
    target.baseRadius = source.baseRadius;
    target.influence = source.influence;
  }

  return true;
};
