export type FpsLimitMode = "30" | "60" | "unlimited";
export type SpawnPresetMode = "balanced" | "side-fed";
export type UiDepthMode = "soft" | "medium" | "deep";
export type AspectRatioMode = "portrait" | "square" | "landscape";

export interface SavedLayoutSummary {
  id: string;
  name: string;
}

export interface FlowParams {
  spawnPreset: SpawnPresetMode;
  symmetryEnabled: boolean;
  particleCount: number;
  trailLength: number;
  integrationStep: number;
  particleLife: number;
  respawnJitter: number;
  loopSpeed: number;
  loopAmount: number;
}

export interface TopologyParams {
  voidRadiusScale: number;
  voidRepel: number;
  ringVorticity: number;
  ringWidth: number;
  channelPull: number;
  channelFlow: number;
  channelSmoothness: number;
  sideInflow: number;
  spineStrength: number;
  edgeFade: number;
  backgroundCurl: number;
  backgroundNoiseScale: number;
  backgroundNoiseSpeed: number;
  backgroundNoiseRoughness: number;
}

export interface LookParams {
  backgroundColor: string;
  lineColor: string;
  frameColor: string;
  frameBevel: number;
  headCircleColor: string;
  showHeadCircles: boolean;
  headCircleSize: number;
  headCircleOpacity: number;
  headCircleThickness: number;
  sphereColor: string;
  sphereBrightness: number;
  sphereContrast: number;
  sphereRoughness: number;
  sphereMetalness: number;
  showTrails: boolean;
  feedbackTrail: boolean;
  feedbackDamp: number;
  lineOpacity: number;
  lineBrightness: number;
  pointSize: number;
  frameOpacity: number;
  contrast: number;
  grainDensity: number;
}

export interface RenderParams {
  pixelRatioCap: number;
  fpsLimit: FpsLimitMode;
  showFieldDebug: boolean;
}

export interface UiParams {
  depth: UiDepthMode;
  soloNoisePlane: boolean;
  bevelStrength: number;
  mainTitle: string;
  description: string;
  textColor: string;
  folderNameColor: string;
  mainColor: string;
  headColor: string;
  headLightness: number;
  saturation: number;
  accentColor: string;
  sliderFillColor: string;
  scrollbarColor: string;
  scale: number;
  widthScale: number;
  menuSectionGap: number;
  menuPaddingTop: number;
  menuPaddingBottom: number;
}
