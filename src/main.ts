import "./style.css";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { AmbientLight, Color, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import {
  captureVoidLayout,
  constrainVoidsInsideFrame,
  createReferenceLayout,
  getReferenceLayoutStorageKey,
  referenceDefaults,
  restoreVoidLayout,
} from "./referenceLayout";
import type { SavedReferenceLayout } from "./referenceLayout";
import { FieldDebugOverlay } from "./render/fieldDebugOverlay";
import { FrameOverlay } from "./render/frameOverlay";
import { ParticleSystemRenderer } from "./sim/particleSystem";
import type { AspectRatioMode, FlowParams, FpsLimitMode, LookParams, RenderParams, TopologyParams, UiParams } from "./types";
import { createControlPanel, type ControlPanelApi } from "./ui/controls";

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function waitAnimationFrame(): Promise<number> {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function formatTimestampForFile(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

interface NamedSavedLayoutEntry {
  id: string;
  name: string;
  savedAt: string;
  layout: SavedReferenceLayout;
}

interface NamedSavedLayoutStore {
  selectedId: string | null;
  entries: NamedSavedLayoutEntry[];
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app container.");
}

root.innerHTML = `
  <main class="app-shell">
    <div id="viewport" class="viewport"></div>
    <div id="overlay" class="overlay"></div>
  </main>
`;

const viewport = requireElement<HTMLDivElement>(root, "#viewport");
const overlay = requireElement<HTMLDivElement>(root, "#overlay");
let aspectRatioMode: AspectRatioMode = "portrait";
let layout = createReferenceLayout(aspectRatioMode);
restoreSavedLayout(aspectRatioMode, layout);

const getNamedLayoutStorageKey = (mode: AspectRatioMode): string =>
  `${getReferenceLayoutStorageKey(mode)}.named`;

const createLayoutId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `layout-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const createUniqueLayoutName = (entries: NamedSavedLayoutEntry[], baseName: string): string => {
  const normalizedBase = baseName.trim();
  if (normalizedBase.length === 0) {
    return "Layout 1";
  }

  const lowerNames = new Set(entries.map((entry) => entry.name.trim().toLowerCase()));
  if (!lowerNames.has(normalizedBase.toLowerCase())) {
    return normalizedBase;
  }

  let suffix = 2;
  while (lowerNames.has(`${normalizedBase} (${suffix})`.toLowerCase())) {
    suffix += 1;
  }
  return `${normalizedBase} (${suffix})`;
};

const sanitizeNamedLayoutStore = (raw: unknown): NamedSavedLayoutStore => {
  if (!raw || typeof raw !== "object") {
    return { selectedId: null, entries: [] };
  }

  const source = raw as { selectedId?: unknown; entries?: unknown };
  const entries = Array.isArray(source.entries)
    ? source.entries.flatMap((item): NamedSavedLayoutEntry[] => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const record = item as Partial<NamedSavedLayoutEntry>;
      if (
        typeof record.id !== "string" ||
        record.id.trim().length === 0 ||
        typeof record.name !== "string" ||
        record.name.trim().length === 0 ||
        !record.layout ||
        typeof record.layout !== "object"
      ) {
        return [];
      }
      return [{
        id: record.id,
        name: record.name.trim(),
        savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date(0).toISOString(),
        layout: record.layout as SavedReferenceLayout,
      }];
    })
    : [];

  const selectedId = typeof source.selectedId === "string" && entries.some((entry) => entry.id === source.selectedId)
    ? source.selectedId
    : entries[0]?.id ?? null;

  return { selectedId, entries };
};

const writeNamedLayoutStore = (mode: AspectRatioMode, store: NamedSavedLayoutStore): void => {
  window.localStorage.setItem(getNamedLayoutStorageKey(mode), JSON.stringify(store));
};

const readNamedLayoutStore = (mode: AspectRatioMode): NamedSavedLayoutStore => {
  const namedRaw = window.localStorage.getItem(getNamedLayoutStorageKey(mode));
  if (namedRaw) {
    try {
      return sanitizeNamedLayoutStore(JSON.parse(namedRaw));
    } catch {
      window.localStorage.removeItem(getNamedLayoutStorageKey(mode));
    }
  }

  const legacyRaw = window.localStorage.getItem(getReferenceLayoutStorageKey(mode));
  if (!legacyRaw) {
    return { selectedId: null, entries: [] };
  }

  try {
    const parsed = JSON.parse(legacyRaw) as SavedReferenceLayout;
    const migratedId = createLayoutId();
    const migratedStore: NamedSavedLayoutStore = {
      selectedId: migratedId,
      entries: [{
        id: migratedId,
        name: "Saved Layout",
        savedAt: new Date().toISOString(),
        layout: parsed,
      }],
    };
    writeNamedLayoutStore(mode, migratedStore);
    return migratedStore;
  } catch {
    return { selectedId: null, entries: [] };
  }
};

let selectedSavedLayoutId: string | null = readNamedLayoutStore(aspectRatioMode).selectedId;

function restoreSavedLayout(mode: AspectRatioMode, targetLayout: typeof layout): boolean {
  const raw = window.localStorage.getItem(getReferenceLayoutStorageKey(mode));
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    const restored = restoreVoidLayout(targetLayout, parsed);
    if (!restored) {
      return false;
    }
    if (mode !== "portrait") {
      constrainVoidsInsideFrame(targetLayout);
    }
    return true;
  } catch {
    window.localStorage.removeItem(getReferenceLayoutStorageKey(mode));
    return false;
  }
}

const syncSavedLayoutDropdown = (): void => {
  const store = readNamedLayoutStore(aspectRatioMode);
  selectedSavedLayoutId = store.selectedId ?? store.entries[0]?.id ?? null;
  controlPanel?.setSavedLayouts(
    store.entries.map((entry) => ({ id: entry.id, name: entry.name })),
    selectedSavedLayoutId,
  );
};

const flowParams: FlowParams = { ...referenceDefaults.flow };
const topologyParams: TopologyParams = { ...referenceDefaults.topology };
const lookParams: LookParams = { ...referenceDefaults.look };
const renderParams: RenderParams = { ...referenceDefaults.render };
const uiParams: UiParams = {
  depth: "medium",
  soloNoisePlane: false,
  bevelStrength: 1,
  mainTitle: "FLOW MATTER",
  description: "Reference-driven 2D flow field.\nProcedural reconstruction of Reference.gif.",
  textColor: "#d5deeb",
  folderNameColor: "#d2dbe9",
  mainColor: "#3a3b42",
  headColor: "#26303d",
  headLightness: 1.08,
  saturation: 0,
  accentColor: "#a8d2ff",
  sliderFillColor: "#a8d2ff",
  scrollbarColor: "#c7d0dc",
  scale: 1,
  widthScale: 1,
  menuSectionGap: 1,
  menuPaddingTop: 1,
  menuPaddingBottom: 1,
};

const scene = new Scene();
scene.background = new Color(lookParams.backgroundColor);

const ambientLight = new AmbientLight(0xffffff, 0.12);
const hemiLight = new HemisphereLight(0xffffff, 0x000000, 0.34);
const keyLight = new DirectionalLight(0xffffff, 0.72);
const rimLight = new DirectionalLight(0x9a9a9a, 0.24);
keyLight.position.set(-3.2, 4.4, 6.2);
rimLight.position.set(2.4, -1.6, 4.8);
scene.add(ambientLight, hemiLight, keyLight, rimLight);

const framePadding = 0.5;
const initialAspect = window.innerWidth / Math.max(window.innerHeight, 1);
const camera = new OrthographicCamera(
  -1 * initialAspect,
  1 * initialAspect,
  1,
  -1,
  0.01,
  50,
);
camera.position.set(0, 0, 10);
camera.zoom = 1.04;
camera.lookAt(0, 0, 0);

const renderer = new WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderParams.pixelRatioCap));
renderer.domElement.className = "viewport-canvas";
viewport.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const afterimagePass = new AfterimagePass();
composer.addPass(renderPass);
composer.addPass(afterimagePass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableDamping = false;
controls.minZoom = 0.9;
controls.maxZoom = 1.9;
controls.update();

const particleSystem = new ParticleSystemRenderer(scene);
let frameOverlay = new FrameOverlay(scene, layout);
let fieldDebugOverlay = new FieldDebugOverlay(scene, layout);
let controlPanel: ControlPanelApi | null = null;
const pointerWorld = new Vector3();

let selectedVoidIndex: number | null = null;
let hoveredVoidIndex: number | null = null;
let activePointerId: number | null = null;
let dragMode: "move" | "radius" | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragStartRadius = 0;
let dragStartInfluence = 0;
let dragStartWorldY = 0;
let pointerDownHitIndex: number | null = null;
let pointerDownWasSelected = false;
let pointerDownClientX = 0;
let pointerDownClientY = 0;
let pointerDidDrag = false;
let hoverPressSuppressedVoidIndex: number | null = null;
const pressedVoidIndices = new Set<number>();
let latestElapsedSeconds = 0;
let exportInProgress = false;

const getAspectFrameSize = (mode: AspectRatioMode): { width: number; height: number } => {
  const previewLayout = mode === aspectRatioMode ? layout : createReferenceLayout(mode);
  return { width: previewLayout.frameWidth, height: previewLayout.frameHeight };
};

const getFpsFrameIntervalMs = (mode: FpsLimitMode): number => {
  if (mode === "unlimited") {
    return 0;
  }
  return 1000 / Number(mode);
};

const updateCameraFrustum = (): void => {
  const viewportAspect = window.innerWidth / Math.max(window.innerHeight, 1);
  const frameSize = getAspectFrameSize(aspectRatioMode);
  const paddedHalfWidth = frameSize.width * 0.5 + framePadding;
  const paddedHalfHeight = frameSize.height * 0.5 + framePadding;
  const cameraHalfHeight = Math.max(paddedHalfHeight, paddedHalfWidth / Math.max(viewportAspect, 1e-5));

  camera.left = -cameraHalfHeight * viewportAspect;
  camera.right = cameraHalfHeight * viewportAspect;
  camera.top = cameraHalfHeight;
  camera.bottom = -cameraHalfHeight;
  camera.updateProjectionMatrix();
  frameOverlay.setFrameSize(frameSize.width, frameSize.height);
};

const setSelectedVoid = (index: number | null): void => {
  selectedVoidIndex = index;
  frameOverlay.setSelectedVoid(index);
  frameOverlay.update(lookParams, topologyParams);
};

const setHoveredVoid = (index: number | null): void => {
  hoveredVoidIndex = index;
  frameOverlay.setHoveredVoid(index);
  renderer.domElement.style.cursor = activePointerId !== null
    ? (dragMode === "radius" ? "ns-resize" : "grabbing")
    : (index === null ? "default" : "pointer");
};

const getPointerWorld = (clientX: number, clientY: number): Vector3 => {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
  const y = -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
  pointerWorld.set(x, y, 0);
  return pointerWorld.unproject(camera);
};

const projectWorldToCanvas = (x: number, y: number): { x: number; y: number } => {
  const projected = new Vector3(x, y, 0).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * renderer.domElement.width,
    y: (-projected.y * 0.5 + 0.5) * renderer.domElement.height,
  };
};

const getFrameCaptureRect = (): { x: number; y: number; width: number; height: number } => {
  const topLeft = projectWorldToCanvas(-layout.halfWidth, layout.halfHeight);
  const bottomRight = projectWorldToCanvas(layout.halfWidth, -layout.halfHeight);
  const x = Math.max(0, Math.floor(Math.min(topLeft.x, bottomRight.x)));
  const y = Math.max(0, Math.floor(Math.min(topLeft.y, bottomRight.y)));
  const maxWidth = renderer.domElement.width - x;
  const maxHeight = renderer.domElement.height - y;
  const width = Math.max(1, Math.min(maxWidth, Math.ceil(Math.abs(bottomRight.x - topLeft.x))));
  const height = Math.max(1, Math.min(maxHeight, Math.ceil(Math.abs(bottomRight.y - topLeft.y))));
  return { x, y, width, height };
};

const renderCurrentFrame = (): void => {
  controls.update();
  if (lookParams.feedbackTrail) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
};

const captureFrameCanvas = (
  crop = getFrameCaptureRect(),
  outputScale = 1,
): HTMLCanvasElement => {
  renderCurrentFrame();
  const canvas = document.createElement("canvas");
  const scaledWidth = Math.max(1, Math.round(crop.width * outputScale));
  const scaledHeight = Math.max(1, Math.round(crop.height * outputScale));
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create export canvas.");
  }
  context.imageSmoothingEnabled = true;
  context.drawImage(
    renderer.domElement,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    scaledWidth,
    scaledHeight,
  );
  return canvas;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const withExportLock = async (kind: "png" | "gif", task: () => Promise<void>): Promise<void> => {
  if (exportInProgress) {
    controlPanel?.setStatus("Export already in progress.", "error");
    return;
  }

  exportInProgress = true;
  controlPanel?.setExporting(kind);
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    controlPanel?.setStatus(message, "error");
  } finally {
    exportInProgress = false;
    controlPanel?.setExporting(null);
  }
};

const exportFrameImage = async (): Promise<void> => withExportLock("png", async () => {
  controlPanel?.setStatus("Exporting PNG...");
  await waitAnimationFrame();
  const canvas = captureFrameCanvas();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }
      reject(new Error("PNG export failed."));
    }, "image/png");
  });

  downloadBlob(blob, `flow-matter-${aspectRatioMode}-${formatTimestampForFile(new Date())}.png`);
  controlPanel?.setStatus("PNG exported.");
});

const exportFrameGif = async (): Promise<void> => withExportLock("gif", async () => {
  const fps = 24;
  const durationMs = 5000;
  const frameCount = Math.round((durationMs / 1000) * fps);
  const frameDelayMs = Math.round(1000 / fps);
  const outputScale = 0.7;
  controlPanel?.setStatus(`Capturing GIF 0/${frameCount}...`);
  await waitAnimationFrame();

  const crop = getFrameCaptureRect();
  const frames: Uint8ClampedArray[] = [];
  let gifWidth = Math.max(1, Math.round(crop.width * outputScale));
  let gifHeight = Math.max(1, Math.round(crop.height * outputScale));
  const start = performance.now();

  for (let index = 0; index < frameCount; index += 1) {
    const targetTime = start + index * frameDelayMs;
    while (performance.now() < targetTime) {
      await waitAnimationFrame();
    }

    const frameCanvas = captureFrameCanvas(crop, outputScale);
    const context = frameCanvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to read GIF frame.");
    }
    gifWidth = frameCanvas.width;
    gifHeight = frameCanvas.height;
    frames.push(context.getImageData(0, 0, gifWidth, gifHeight).data);
    controlPanel?.setStatus(`Capturing GIF ${index + 1}/${frameCount}...`);
  }

  controlPanel?.setStatus("Encoding GIF...");
  const gif = GIFEncoder();
  for (const rgba of frames) {
    const palette = quantize(rgba, 256);
    const indices = applyPalette(rgba, palette);
    gif.writeFrame(indices, gifWidth, gifHeight, {
      palette,
      delay: frameDelayMs,
      repeat: 0,
    });
  }
  gif.finish();
  const gifBytes = gif.bytes();
  const gifArray = new Uint8Array(gifBytes.byteLength);
  gifArray.set(gifBytes);

  downloadBlob(
    new Blob([gifArray.buffer], { type: "image/gif" }),
    `flow-matter-${aspectRatioMode}-${formatTimestampForFile(new Date())}.gif`,
  );
  controlPanel?.setStatus("GIF exported.");
});

const clampVoidPosition = (value: number, limit: number): number => {
  return Math.max(-limit, Math.min(limit, value));
};

const findInactiveVoidSlot = (): number | null => {
  for (let i = 0; i < layout.voids.length; i += 1) {
    if (!layout.voids[i].active) {
      return i;
    }
  }
  return null;
};

const findVoidAtWorld = (worldX: number, worldY: number): number | null => {
  let hitIndex: number | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < layout.voids.length; i += 1) {
    const voidNode = layout.voids[i];
    if (!voidNode.active) {
      continue;
    }
    const radius = voidNode.baseRadius * topologyParams.voidRadiusScale;
    const dx = worldX - voidNode.x;
    const dy = worldY - voidNode.y;
    const distanceSq = dx * dx + dy * dy;
    const hitRadius = radius + 0.08;
    if (distanceSq <= hitRadius * hitRadius && distanceSq < bestDistanceSq) {
      hitIndex = i;
      bestDistanceSq = distanceSq;
    }
  }

  return hitIndex;
};

const symmetrizeLayoutLeftToRight = (): void => {
  const mirrorThreshold = 0.04;
  const leftIndices = layout.voids
    .map((voidNode, index) => ({ voidNode, index }))
    .filter(({ voidNode }) => voidNode.x < -mirrorThreshold)
    .sort((left, right) => {
      if (left.voidNode.y !== right.voidNode.y) {
        return left.voidNode.y - right.voidNode.y;
      }
      return left.voidNode.x - right.voidNode.x;
    });
  const rightIndices = layout.voids
    .map((voidNode, index) => ({ voidNode, index }))
    .filter(({ voidNode }) => voidNode.x > mirrorThreshold)
    .sort((left, right) => {
      if (left.voidNode.y !== right.voidNode.y) {
        return left.voidNode.y - right.voidNode.y;
      }
      return left.voidNode.x - right.voidNode.x;
    });

  if (leftIndices.length === 0 || rightIndices.length === 0) {
    controlPanel?.setStatus("Symmetry needs both left and right side voids.", "error");
    return;
  }

  for (let targetOrder = 0; targetOrder < rightIndices.length; targetOrder += 1) {
    const target = rightIndices[targetOrder];
    const sourceOrder = rightIndices.length === 1
      ? Math.round((leftIndices.length - 1) * 0.5)
      : Math.round((targetOrder * (leftIndices.length - 1)) / Math.max(rightIndices.length - 1, 1));
    const source = leftIndices[Math.max(0, Math.min(leftIndices.length - 1, sourceOrder))];

    target.voidNode.x = -source.voidNode.x;
    target.voidNode.y = source.voidNode.y;
    target.voidNode.baseRadius = source.voidNode.baseRadius;
    target.voidNode.influence = source.voidNode.influence;
    target.voidNode.active = source.voidNode.active;
    target.voidNode.emitter = source.voidNode.emitter;

    if (pressedVoidIndices.has(source.index)) {
      pressedVoidIndices.add(target.index);
    } else {
      pressedVoidIndices.delete(target.index);
    }
  }
};

const applySymmetryIfEnabled = (notify = false): void => {
  if (!flowParams.symmetryEnabled) {
    return;
  }

  symmetrizeLayoutLeftToRight();
  if (aspectRatioMode !== "portrait") {
    constrainVoidsInsideFrame(layout, topologyParams.voidRadiusScale);
  }

  frameOverlay.clearPressedVoids();
  for (const pressedIndex of pressedVoidIndices) {
    frameOverlay.setPressedVoid(pressedIndex, true);
  }
  if (notify) {
    controlPanel?.setStatus("Symmetry enabled. Left side drives right side.");
  }
};

const saveNamedLayoutToStorage = (requestedLayoutId: string | null): void => {
  const store = readNamedLayoutStore(aspectRatioMode);
  const selectedEntry = requestedLayoutId === null
    ? null
    : store.entries.find((entry) => entry.id === requestedLayoutId) ?? null;
  const suggestedName = selectedEntry?.name ?? `${aspectRatioMode[0].toUpperCase()}${aspectRatioMode.slice(1)} ${store.entries.length + 1}`;
  const rawName = window.prompt("Layout name", suggestedName);
  if (rawName === null) {
    return;
  }

  const name = rawName.trim();
  if (name.length === 0) {
    controlPanel?.setStatus("Layout name is required.", "error");
    return;
  }

  const snapshot = captureVoidLayout(layout);
  const targetEntry = {
    id: createLayoutId(),
    name: createUniqueLayoutName(store.entries, name),
    savedAt: new Date().toISOString(),
    layout: snapshot,
  };
  store.entries.push(targetEntry);

  store.selectedId = targetEntry.id;
  selectedSavedLayoutId = targetEntry.id;
  writeNamedLayoutStore(aspectRatioMode, store);
  window.localStorage.setItem(getReferenceLayoutStorageKey(aspectRatioMode), JSON.stringify(snapshot));
  syncSavedLayoutDropdown();
  controlPanel?.setStatus(`Layout saved: ${targetEntry.name}.`);
};

const loadLayoutFromStorage = (layoutId: string | null): void => {
  const store = readNamedLayoutStore(aspectRatioMode);
  const targetEntry = layoutId === null
    ? null
    : store.entries.find((entry) => entry.id === layoutId) ?? null;
  if (!targetEntry) {
    controlPanel?.setStatus("Select a saved layout first.", "error");
    syncSavedLayoutDropdown();
    return;
  }

  if (!restoreVoidLayout(layout, targetEntry.layout)) {
    controlPanel?.setStatus("Saved layout is invalid.", "error");
    return;
  }

  applySymmetryIfEnabled(false);
  if (!flowParams.symmetryEnabled && aspectRatioMode !== "portrait") {
    constrainVoidsInsideFrame(layout);
  }

  store.selectedId = targetEntry.id;
  selectedSavedLayoutId = targetEntry.id;
  writeNamedLayoutStore(aspectRatioMode, store);
  window.localStorage.setItem(getReferenceLayoutStorageKey(aspectRatioMode), JSON.stringify(captureVoidLayout(layout)));

  pressedVoidIndices.clear();
  frameOverlay.clearPressedVoids();
  selectedVoidIndex = null;
  hoveredVoidIndex = null;
  hoverPressSuppressedVoidIndex = null;
  pointerDownHitIndex = null;
  pointerDownWasSelected = false;
  pointerDidDrag = false;
  setSelectedVoid(null);
  setHoveredVoid(null);
  composer.reset();
  rebuildSimulation();
  controlPanel?.setStatus("Layout loaded.");
  syncSavedLayoutDropdown();
};

const applyLookSettings = (): void => {
  scene.background = new Color(lookParams.backgroundColor);
  viewport.style.backgroundColor = lookParams.backgroundColor;
  renderer.setClearColor(lookParams.backgroundColor, 1);
  afterimagePass.uniforms.damp.value = lookParams.feedbackDamp;

  const sphereBrightness = clamp(lookParams.sphereBrightness, 0, 2);
  const sphereContrast = clamp(lookParams.sphereContrast, 0, 2);
  ambientLight.intensity = 0.03 + sphereBrightness * (0.11 - sphereContrast * 0.025);
  hemiLight.intensity = 0.08 + sphereBrightness * (0.19 - sphereContrast * 0.03);
  keyLight.intensity = 0.18 + sphereBrightness * (0.42 + sphereContrast * 0.46);
  rimLight.intensity = 0.05 + sphereBrightness * (0.14 + sphereContrast * 0.18);

  particleSystem.applyLook(lookParams);
  frameOverlay.update(lookParams, topologyParams);
  composer.reset();
};

const applyRenderSettings = (): void => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderParams.pixelRatioCap));
  composer.setPixelRatio(Math.min(window.devicePixelRatio, renderParams.pixelRatioCap));
  fieldDebugOverlay.setVisible(renderParams.showFieldDebug);
};

const rebuildSimulation = (): void => {
  particleSystem.rebuild(layout, flowParams, topologyParams, lookParams);
  applyLookSettings();
  particleSystem.warmUp(120, 1 / 60, flowParams, topologyParams, lookParams);
  controlPanel?.setStatus("Reference field rebuilt.");
};

const applyAspectRatioMode = (mode: AspectRatioMode): void => {
  aspectRatioMode = mode;
  layout = createReferenceLayout(mode);
  restoreSavedLayout(mode, layout);
  selectedSavedLayoutId = readNamedLayoutStore(mode).selectedId;
  applySymmetryIfEnabled(false);

  pressedVoidIndices.clear();
  if (frameOverlay) {
    frameOverlay.dispose();
  }
  if (fieldDebugOverlay) {
    fieldDebugOverlay.dispose();
  }
  frameOverlay = new FrameOverlay(scene, layout);
  fieldDebugOverlay = new FieldDebugOverlay(scene, layout);
  selectedVoidIndex = null;
  hoveredVoidIndex = null;
  hoverPressSuppressedVoidIndex = null;
  pointerDownHitIndex = null;
  pointerDownWasSelected = false;
  pointerDidDrag = false;

  updateCameraFrustum();
  applyRenderSettings();
  rebuildSimulation();
  syncSavedLayoutDropdown();
};

controlPanel = createControlPanel(
  overlay,
  {
    aspectRatioMode,
    flow: flowParams,
    topology: topologyParams,
    look: lookParams,
    render: renderParams,
    ui: uiParams,
  },
  {
    onAspectRatioChange: (mode): void => {
      applyAspectRatioMode(mode);
      composer.reset();
      controlPanel?.setStatus(mode === "portrait" ? "Portrait format." : mode === "square" ? "Square format." : "Landscape format.");
    },
    onLiveChange: (): void => {
      applyLookSettings();
      applyRenderSettings();
    },
    onSimulationRebuild: (): void => {
      rebuildSimulation();
    },
    onSymmetryChange: (enabled): void => {
      if (enabled) {
        applySymmetryIfEnabled(true);
        updateEditedVoid();
      } else {
        controlPanel?.setStatus("Symmetry disabled.");
      }
    },
    onLoadLayout: (layoutId): void => {
      loadLayoutFromStorage(layoutId);
    },
    onSaveLayout: (layoutId): void => {
      saveNamedLayoutToStorage(layoutId);
    },
    onExportImage: (): void => {
      void exportFrameImage();
    },
    onExportGif: (): void => {
      void exportFrameGif();
    },
  },
);

syncSavedLayoutDropdown();

updateCameraFrustum();
applyRenderSettings();
rebuildSimulation();
controlPanel.setStatus("Reference flow loaded.");

const onResize = (): void => {
  updateCameraFrustum();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  applyRenderSettings();
};

window.addEventListener("resize", onResize);

const updateEditedVoid = (): void => {
  frameOverlay.update(lookParams, topologyParams);
  if (lookParams.feedbackTrail) {
    composer.reset();
  }
};

const applyVoidRadius = (voidIndex: number, nextRadius: number): void => {
  const voidNode = layout.voids[voidIndex];
  const clampedRadius = Math.max(0.03, Math.min(0.34, nextRadius));
  const ratio = clampedRadius / Math.max(voidNode.baseRadius, 1e-5);
  voidNode.baseRadius = clampedRadius;
  voidNode.influence = Math.max(0.04, Math.min(0.8, voidNode.influence * ratio));
};

const onCanvasPointerDown = (event: PointerEvent): void => {
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) {
    return;
  }

  const world = getPointerWorld(event.clientX, event.clientY);
  const hitIndex = findVoidAtWorld(world.x, world.y);
  if (hitIndex === null) {
    pointerDownHitIndex = null;
    pointerDownWasSelected = false;
    pointerDidDrag = false;
    hoverPressSuppressedVoidIndex = null;
    frameOverlay.suppressHoveredVoid(null);
    setSelectedVoid(null);
    setHoveredVoid(null);
    return;
  }

  event.preventDefault();
  if (event.button === 2) {
    layout.voids[hitIndex].active = false;
    layout.voids[hitIndex].emitter = false;
    pressedVoidIndices.delete(hitIndex);
    frameOverlay.setPressedVoid(hitIndex, false);
    if (selectedVoidIndex === hitIndex) {
      setSelectedVoid(null);
    }
    setHoveredVoid(null);
    applySymmetryIfEnabled(false);
    updateEditedVoid();
    controlPanel?.setStatus(`Void ${hitIndex + 1} removed. Reset layout to restore it.`);
    return;
  }

  if (event.button === 1) {
    const voidNode = layout.voids[hitIndex];
    voidNode.emitter = !voidNode.emitter;
    setSelectedVoid(hitIndex);
    setHoveredVoid(hitIndex);
    updateEditedVoid();
    if (voidNode.emitter) {
      particleSystem.seedEmitterBurst(
        hitIndex,
        Math.max(24, Math.round(flowParams.particleCount * 0.08)),
        flowParams,
        topologyParams,
        lookParams,
        latestElapsedSeconds,
      );
    }
    applySymmetryIfEnabled(false);
    controlPanel?.setStatus(
      voidNode.emitter
        ? `Void ${hitIndex + 1} set as emitter.`
        : `Void ${hitIndex + 1} emitter disabled.`,
    );
    return;
  }

  pointerDownHitIndex = hitIndex;
  pointerDownWasSelected = pressedVoidIndices.has(hitIndex);
  pointerDownClientX = event.clientX;
  pointerDownClientY = event.clientY;
  pointerDidDrag = false;
  setSelectedVoid(hitIndex);
  hoverPressSuppressedVoidIndex = null;
  frameOverlay.suppressHoveredVoid(null);
  setHoveredVoid(hitIndex);
  activePointerId = event.pointerId;
  dragMode = event.shiftKey ? "radius" : "move";
  dragStartWorldY = world.y;
  dragStartRadius = layout.voids[hitIndex].baseRadius;
  dragStartInfluence = layout.voids[hitIndex].influence;
  dragOffsetX = world.x - layout.voids[hitIndex].x;
  dragOffsetY = world.y - layout.voids[hitIndex].y;
  renderer.domElement.setPointerCapture(event.pointerId);
  controlPanel?.setStatus(
    dragMode === "radius"
      ? `Editing void ${hitIndex + 1} radius.`
      : `Moving void ${hitIndex + 1}.`,
  );
};

const onCanvasPointerMove = (event: PointerEvent): void => {
  const world = getPointerWorld(event.clientX, event.clientY);
  const hitIndex = findVoidAtWorld(world.x, world.y);
  if (hoverPressSuppressedVoidIndex !== null && hitIndex !== hoverPressSuppressedVoidIndex) {
    hoverPressSuppressedVoidIndex = null;
    frameOverlay.suppressHoveredVoid(null);
  }
  setHoveredVoid(hitIndex);

  if (activePointerId === null || event.pointerId !== activePointerId || selectedVoidIndex === null || dragMode === null) {
    return;
  }

  if (!pointerDidDrag) {
    const deltaX = event.clientX - pointerDownClientX;
    const deltaY = event.clientY - pointerDownClientY;
    if ((deltaX * deltaX) + (deltaY * deltaY) > 16) {
      pointerDidDrag = true;
    }
  }

  const voidNode = layout.voids[selectedVoidIndex];

  if (dragMode === "move") {
    const margin = voidNode.baseRadius * topologyParams.voidRadiusScale + 0.02;
    voidNode.x = clampVoidPosition(world.x - dragOffsetX, layout.halfWidth - margin);
    voidNode.y = clampVoidPosition(world.y - dragOffsetY, layout.halfHeight - margin);
  } else {
    const radiusDelta = (world.y - dragStartWorldY) * 0.65;
    const nextRadius = dragStartRadius + radiusDelta;
    const nextInfluence = dragStartInfluence * (nextRadius / Math.max(dragStartRadius, 1e-5));
    applyVoidRadius(selectedVoidIndex, nextRadius);
    voidNode.influence = Math.max(0.04, Math.min(0.8, nextInfluence));
  }

  applySymmetryIfEnabled(false);
  updateEditedVoid();
};

const stopVoidDrag = (pointerId?: number): void => {
  if (activePointerId === null) {
    return;
  }
  if (pointerId !== undefined && pointerId !== activePointerId) {
    return;
  }

  if (renderer.domElement.hasPointerCapture(activePointerId)) {
    renderer.domElement.releasePointerCapture(activePointerId);
  }
  activePointerId = null;
  dragMode = null;
  renderer.domElement.style.cursor = hoveredVoidIndex === null ? "default" : "pointer";
  controlPanel?.setStatus(
    selectedVoidIndex === null
      ? "Reference flow loaded."
      : `Void ${selectedVoidIndex + 1} edited. Save layout if needed.`,
  );
};

const onCanvasPointerUp = (event: PointerEvent): void => {
  let clickStatus: string | null = null;

  if (activePointerId !== null && event.pointerId === activePointerId) {
    const world = getPointerWorld(event.clientX, event.clientY);
    const hitIndex = findVoidAtWorld(world.x, world.y);

    if (!pointerDidDrag && pointerDownHitIndex !== null && hitIndex === pointerDownHitIndex) {
      if (pointerDownWasSelected) {
        pressedVoidIndices.delete(pointerDownHitIndex);
        frameOverlay.setPressedVoid(pointerDownHitIndex, false);
        hoverPressSuppressedVoidIndex = pointerDownHitIndex;
        frameOverlay.suppressHoveredVoid(pointerDownHitIndex);
        frameOverlay.releasePressInstant(pointerDownHitIndex);
        setSelectedVoid(null);
        clickStatus = `Void ${pointerDownHitIndex + 1} released.`;
      } else {
        pressedVoidIndices.add(pointerDownHitIndex);
        frameOverlay.setPressedVoid(pointerDownHitIndex, true);
        hoverPressSuppressedVoidIndex = null;
        frameOverlay.suppressHoveredVoid(null);
        setSelectedVoid(pointerDownHitIndex);
        clickStatus = `Void ${pointerDownHitIndex + 1} pressed.`;
      }
    }
  }

  pointerDownHitIndex = null;
  pointerDownWasSelected = false;
  pointerDidDrag = false;
  stopVoidDrag(event.pointerId);
  if (clickStatus) {
    controlPanel?.setStatus(clickStatus);
  }
};
const onCanvasPointerCancel = (event: PointerEvent): void => stopVoidDrag(event.pointerId);
const onCanvasPointerLeave = (): void => {
  if (activePointerId === null) {
    hoverPressSuppressedVoidIndex = null;
    frameOverlay.suppressHoveredVoid(null);
    setHoveredVoid(null);
  }
};

const onCanvasWheel = (event: WheelEvent): void => {
  const world = getPointerWorld(event.clientX, event.clientY);
  const hitIndex = findVoidAtWorld(world.x, world.y);
  const targetIndex = hitIndex ?? selectedVoidIndex;
  if (targetIndex === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  setSelectedVoid(targetIndex);

  const voidNode = layout.voids[targetIndex];
  const scale = event.deltaY < 0 ? 1.06 : 0.94;
  applyVoidRadius(targetIndex, voidNode.baseRadius * scale);
  applySymmetryIfEnabled(false);
  updateEditedVoid();
  controlPanel?.setStatus(`Void ${targetIndex + 1} radius adjusted. Save layout if needed.`);
};

const onCanvasDoubleClick = (event: MouseEvent): void => {
  if (event.button !== 0) {
    return;
  }

  const world = getPointerWorld(event.clientX, event.clientY);
  const hitIndex = findVoidAtWorld(world.x, world.y);
  if (hitIndex !== null) {
    return;
  }

  const inactiveIndex = findInactiveVoidSlot();
  if (inactiveIndex === null) {
    controlPanel?.setStatus("No removed void slots available. Middle-click a button first.", "error");
    return;
  }

  const voidNode = layout.voids[inactiveIndex];
  const margin = voidNode.baseRadius * topologyParams.voidRadiusScale + 0.02;
  voidNode.x = clampVoidPosition(world.x, layout.halfWidth - margin);
  voidNode.y = clampVoidPosition(world.y, layout.halfHeight - margin);
  voidNode.active = true;
  voidNode.emitter = false;
  pressedVoidIndices.delete(inactiveIndex);
  frameOverlay.setPressedVoid(inactiveIndex, false);
  setSelectedVoid(inactiveIndex);
  setHoveredVoid(inactiveIndex);
  applySymmetryIfEnabled(false);
  updateEditedVoid();
  controlPanel?.setStatus(`Void ${inactiveIndex + 1} added. Save layout if needed.`);
};

const onCanvasContextMenu = (event: MouseEvent): void => {
  event.preventDefault();
};

renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);
renderer.domElement.addEventListener("pointermove", onCanvasPointerMove);
renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);
renderer.domElement.addEventListener("pointercancel", onCanvasPointerCancel);
renderer.domElement.addEventListener("pointerleave", onCanvasPointerLeave);
renderer.domElement.addEventListener("wheel", onCanvasWheel, { passive: false });
renderer.domElement.addEventListener("dblclick", onCanvasDoubleClick);
renderer.domElement.addEventListener("contextmenu", onCanvasContextMenu);

let lastRenderedTimestampMs = 0;
let smoothedFps = 60;

renderer.setAnimationLoop((timestampMs: number) => {
  if (lastRenderedTimestampMs === 0) {
    lastRenderedTimestampMs = timestampMs;
  }

  const intervalMs = getFpsFrameIntervalMs(renderParams.fpsLimit);
  if (intervalMs > 0 && timestampMs - lastRenderedTimestampMs < intervalMs) {
    return;
  }

  const deltaMs = Math.max(0.001, timestampMs - lastRenderedTimestampMs);
  lastRenderedTimestampMs = timestampMs;
  const deltaSeconds = deltaMs / 1000;
  const elapsedSeconds = timestampMs / 1000;
  latestElapsedSeconds = elapsedSeconds;

  smoothedFps += ((1000 / deltaMs) - smoothedFps) * 0.15;
  controlPanel?.setFps(smoothedFps);

  controls.update();
  particleSystem.update(deltaSeconds, elapsedSeconds, flowParams, topologyParams, lookParams);
  frameOverlay.update(lookParams, topologyParams);
  fieldDebugOverlay.update(elapsedSeconds, flowParams, topologyParams);
  if (lookParams.feedbackTrail) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
});

const dispose = (): void => {
  window.removeEventListener("resize", onResize);
  renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown);
  renderer.domElement.removeEventListener("pointermove", onCanvasPointerMove);
  renderer.domElement.removeEventListener("pointerup", onCanvasPointerUp);
  renderer.domElement.removeEventListener("pointercancel", onCanvasPointerCancel);
  renderer.domElement.removeEventListener("pointerleave", onCanvasPointerLeave);
  renderer.domElement.removeEventListener("wheel", onCanvasWheel);
  renderer.domElement.removeEventListener("dblclick", onCanvasDoubleClick);
  stopVoidDrag();
  renderer.setAnimationLoop(null);
  controlPanel?.dispose();
  particleSystem.dispose();
  frameOverlay.dispose();
  fieldDebugOverlay.dispose();
  controls.dispose();
  composer.dispose();
  renderer.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
