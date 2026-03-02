import "./style.css";
import { AmbientLight, Color, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import {
  captureVoidLayout,
  createReferenceLayout,
  getReferenceLayoutStorageKey,
  referenceDefaults,
  restoreVoidLayout,
} from "./referenceLayout";
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
let defaultLayout = createReferenceLayout(aspectRatioMode);
let layout = createReferenceLayout(aspectRatioMode);
restoreSavedLayout(aspectRatioMode, layout);

function restoreSavedLayout(mode: AspectRatioMode, targetLayout: typeof layout): void {
  const raw = window.localStorage.getItem(getReferenceLayoutStorageKey(mode));
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    restoreVoidLayout(targetLayout, parsed);
  } catch {
    window.localStorage.removeItem(getReferenceLayoutStorageKey(mode));
  }
}

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

const framePadding = 0.28;
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

const saveLayoutToStorage = (): void => {
  window.localStorage.setItem(getReferenceLayoutStorageKey(aspectRatioMode), JSON.stringify(captureVoidLayout(layout)));
  controlPanel?.setStatus("Layout saved.");
};

const resetLayoutToDefault = (): void => {
  restoreVoidLayout(layout, captureVoidLayout(defaultLayout));
  pressedVoidIndices.clear();
  frameOverlay.clearPressedVoids();
  setSelectedVoid(null);
  window.localStorage.removeItem(getReferenceLayoutStorageKey(aspectRatioMode));
  rebuildSimulation();
  controlPanel?.setStatus("Layout reset.");
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
  defaultLayout = createReferenceLayout(mode);
  layout = createReferenceLayout(mode);
  restoreSavedLayout(mode, layout);

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
    onSaveLayout: (): void => {
      saveLayoutToStorage();
    },
    onResetLayout: (): void => {
      resetLayoutToDefault();
    },
  },
);

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
