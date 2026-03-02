import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Scene,
} from "three";
import type { ReferenceChannel, ReferenceLayout, ReferenceSpawnBand, ReferenceVoid } from "../referenceLayout";
import type { FlowParams, LookParams, TopologyParams } from "../types";
import { isInsideAnyVoid, isOutsideFrame, sampleField, type MutableVec2 } from "./flowField";

const randomRange = (min: number, max: number): number => min + Math.random() * (max - min);

const samplePolyline = (points: ReferenceChannel["points"] | ReferenceSpawnBand["points"]): MutableVec2 => {
  if (points.length <= 1) {
    return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 };
  }

  let totalLength = 0;
  const lengths = new Array<number>(points.length - 1);
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    lengths[i] = length;
    totalLength += length;
  }

  let target = Math.random() * Math.max(totalLength, 1e-5);
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i];
    if (target > length) {
      target -= length;
      continue;
    }

    const t = length > 0 ? target / length : 0;
    const a = points[i];
    const b = points[i + 1];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
};

const chooseWeightedSpawnBand = (bands: ReferenceSpawnBand[]): ReferenceSpawnBand => {
  let totalWeight = 0;
  for (const band of bands) {
    totalWeight += band.weight;
  }

  let cursor = Math.random() * Math.max(totalWeight, 1e-5);
  for (const band of bands) {
    cursor -= band.weight;
    if (cursor <= 0) {
      return band;
    }
  }

  return bands[bands.length - 1];
};

const chooseVoid = (voids: ReferenceVoid[]): ReferenceVoid | null => {
  const activeVoids = voids.filter((voidNode) => voidNode.active);
  if (activeVoids.length === 0) {
    return null;
  }
  return activeVoids[Math.floor(Math.random() * activeVoids.length)];
};

const chooseEmitterVoid = (voids: ReferenceVoid[]): ReferenceVoid | null => {
  const emitters = voids.filter((voidNode) => voidNode.active && voidNode.emitter);
  if (emitters.length === 0) {
    return null;
  }
  return emitters[Math.floor(Math.random() * emitters.length)];
};

const sampleEmitterSpawnForVoid = (
  emitter: ReferenceVoid,
  topology: TopologyParams,
): MutableVec2 => {
  const radius = emitter.baseRadius * topology.voidRadiusScale;
  const angle = Math.random() * Math.PI * 2;
  const ring = radius * randomRange(1.02, 1.08);
  return {
    x: emitter.x + Math.cos(angle) * ring,
    y: emitter.y + Math.sin(angle) * ring,
  };
};

const sampleEmitterSpawn = (
  layout: ReferenceLayout,
  topology: TopologyParams,
): MutableVec2 | null => {
  const emitter = chooseEmitterVoid(layout.voids);
  if (!emitter) {
    return null;
  }

  return sampleEmitterSpawnForVoid(emitter, topology);
};

const sampleEdgeSpawn = (layout: ReferenceLayout): MutableVec2 => {
  const edgeMode = Math.random();
  const verticalRange = layout.halfHeight * 0.94;
  const horizontalRange = layout.halfWidth * 0.96;

  if (edgeMode < 0.42) {
    return {
      x: -layout.halfWidth,
      y: randomRange(-verticalRange, verticalRange),
    };
  }

  if (edgeMode < 0.84) {
    return {
      x: layout.halfWidth,
      y: randomRange(-verticalRange, verticalRange),
    };
  }

  return {
    x: randomRange(-horizontalRange, horizontalRange),
    y: -layout.halfHeight,
  };
};

const sampleBalancedRespawn = (
  layout: ReferenceLayout,
  flow: FlowParams,
  topology: TopologyParams,
  look: LookParams,
): MutableVec2 => {
  const emitterSpawn = sampleEmitterSpawn(layout, topology);
  const mode = Math.random();

  if (emitterSpawn && mode < 0.32) {
    return emitterSpawn;
  }

  if (mode < 0.52) {
    const band = chooseWeightedSpawnBand(layout.spawnBands);
    const point = samplePolyline(band.points);
    return {
      x: point.x + randomRange(-band.width, band.width) * 0.25 + randomRange(-band.jitter, band.jitter),
      y: point.y + randomRange(-band.width, band.width) * 0.25 + randomRange(-band.jitter, band.jitter),
    };
  }

  if (mode < 0.86) {
    const voidNode = chooseVoid(layout.voids);
    if (voidNode) {
      const radius = voidNode.baseRadius * topology.voidRadiusScale;
      const angle = Math.random() * Math.PI * 2;
      const ring = radius * randomRange(1.1, 2.2);
      return {
        x: voidNode.x + Math.cos(angle) * ring + randomRange(-flow.respawnJitter, flow.respawnJitter),
        y: voidNode.y + Math.sin(angle) * ring + randomRange(-flow.respawnJitter, flow.respawnJitter),
      };
    }
  }

  let x = randomRange(-layout.halfWidth, layout.halfWidth);
  let y = randomRange(-layout.halfHeight, layout.halfHeight);
  if (Math.random() < look.grainDensity * 0.65) {
    x *= randomRange(0.7, 1);
    y *= randomRange(0.7, 1);
  }
  return { x, y };
};

const sampleSideFedRespawn = (
  layout: ReferenceLayout,
  flow: FlowParams,
  topology: TopologyParams,
  look: LookParams,
): MutableVec2 => {
  const emitterSpawn = sampleEmitterSpawn(layout, topology);
  const mode = Math.random();

  if (emitterSpawn && mode < 0.28) {
    return emitterSpawn;
  }

  if (mode < 0.36) {
    const band = chooseWeightedSpawnBand(layout.spawnBands);
    const point = samplePolyline(band.points);
    return {
      x: point.x + randomRange(-band.width, band.width) * 0.25 + randomRange(-band.jitter, band.jitter),
      y: point.y + randomRange(-band.width, band.width) * 0.25 + randomRange(-band.jitter, band.jitter),
    };
  }

  if (mode < 0.58) {
    const voidNode = chooseVoid(layout.voids);
    if (voidNode) {
      const radius = voidNode.baseRadius * topology.voidRadiusScale;
      const angle = Math.random() * Math.PI * 2;
      const ring = radius * randomRange(1.1, 2.2);
      return {
        x: voidNode.x + Math.cos(angle) * ring + randomRange(-flow.respawnJitter, flow.respawnJitter),
        y: voidNode.y + Math.sin(angle) * ring + randomRange(-flow.respawnJitter, flow.respawnJitter),
      };
    }
  }

  if (mode < 0.92) {
    return sampleEdgeSpawn(layout);
  }

  let x = randomRange(-layout.halfWidth, layout.halfWidth);
  let y = randomRange(-layout.halfHeight, layout.halfHeight);
  if (Math.random() < look.grainDensity * 0.65) {
    x *= randomRange(0.7, 1);
    y *= randomRange(0.7, 1);
  }
  return { x, y };
};

export class ParticleSystemRenderer {
  private readonly scene: Scene;

  private pointsGeometry: BufferGeometry | null = null;
  private pointsMaterial: PointsMaterial | null = null;
  private pointsObject: Points<BufferGeometry, PointsMaterial> | null = null;
  private headGeometry: BufferGeometry | null = null;
  private headMaterial: PointsMaterial | null = null;
  private headObject: Points<BufferGeometry, PointsMaterial> | null = null;
  private headTexture: CanvasTexture | null = null;
  private linesGeometry: BufferGeometry | null = null;
  private linesMaterial: LineBasicMaterial | null = null;
  private linesObject: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;

  private positions = new Float32Array();
  private ages = new Float32Array();
  private history = new Float32Array();
  private heads = new Uint16Array();

  private pointPositions = new Float32Array();
  private pointColors = new Float32Array();
  private headPositions = new Float32Array();
  private headColors = new Float32Array();
  private linePositions = new Float32Array();
  private lineColors = new Float32Array();

  private flowParams: FlowParams | null = null;
  private layout: ReferenceLayout | null = null;
  private particleCount = 0;
  private trailLength = 0;

  private readonly fieldVecA: MutableVec2 = { x: 0, y: 0 };
  private readonly fieldVecB: MutableVec2 = { x: 0, y: 0 };

  constructor(scene: Scene) {
    this.scene = scene;
  }

  rebuild(layout: ReferenceLayout, flow: FlowParams, topology: TopologyParams, look: LookParams): void {
    this.disposeGeometry();

    this.layout = layout;
    this.flowParams = { ...flow };
    this.particleCount = Math.max(100, Math.round(flow.particleCount));
    this.trailLength = Math.max(8, Math.round(flow.trailLength));

    this.positions = new Float32Array(this.particleCount * 2);
    this.ages = new Float32Array(this.particleCount);
    this.history = new Float32Array(this.particleCount * this.trailLength * 2);
    this.heads = new Uint16Array(this.particleCount);

    const pointCount = this.particleCount * this.trailLength;
    const lineVertexCount = this.particleCount * (this.trailLength - 1) * 2;
    this.pointPositions = new Float32Array(pointCount * 3);
    this.pointColors = new Float32Array(pointCount * 3);
    this.headPositions = new Float32Array(this.particleCount * 3);
    this.headColors = new Float32Array(this.particleCount * 3);
    this.linePositions = new Float32Array(lineVertexCount * 3);
    this.lineColors = new Float32Array(lineVertexCount * 3);

    for (let i = 0; i < this.particleCount; i += 1) {
      this.respawnParticle(i, layout, flow, topology, look, 0);
    }

    this.pointsGeometry = new BufferGeometry();
    this.pointsGeometry.setAttribute("position", new BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setAttribute("color", new BufferAttribute(this.pointColors, 3));

    this.pointsMaterial = new PointsMaterial({
      size: look.pointSize,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    this.pointsObject = new Points(this.pointsGeometry, this.pointsMaterial);
    this.pointsObject.frustumCulled = false;
    this.pointsObject.renderOrder = 10;
    this.scene.add(this.pointsObject);

    this.headGeometry = new BufferGeometry();
    this.headGeometry.setAttribute("position", new BufferAttribute(this.headPositions, 3));
    this.headGeometry.setAttribute("color", new BufferAttribute(this.headColors, 3));

    this.headTexture = this.createRingTexture(look.headCircleThickness);
    this.headMaterial = new PointsMaterial({
      size: look.headCircleSize,
      sizeAttenuation: false,
      map: this.headTexture,
      alphaMap: this.headTexture,
      vertexColors: true,
      transparent: true,
      opacity: look.headCircleOpacity,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.headObject = new Points(this.headGeometry, this.headMaterial);
    this.headObject.frustumCulled = false;
    this.headObject.renderOrder = 11;
    this.scene.add(this.headObject);

    this.linesGeometry = new BufferGeometry();
    this.linesGeometry.setAttribute("position", new BufferAttribute(this.linePositions, 3));
    this.linesGeometry.setAttribute("color", new BufferAttribute(this.lineColors, 3));

    this.linesMaterial = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: look.lineOpacity,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    this.linesObject = new LineSegments(this.linesGeometry, this.linesMaterial);
    this.linesObject.frustumCulled = false;
    this.linesObject.renderOrder = 9;
    this.scene.add(this.linesObject);
  }

  applyLook(look: LookParams): void {
    if (this.pointsMaterial) {
      this.pointsMaterial.size = look.pointSize;
    }
    if (this.headMaterial) {
      this.headMaterial.size = look.headCircleSize;
      this.headMaterial.opacity = look.headCircleOpacity;
      this.updateHeadTexture(look.headCircleThickness);
    }
    if (this.linesMaterial) {
      this.linesMaterial.opacity = look.lineOpacity;
    }
    if (this.headObject) {
      this.headObject.visible = look.showHeadCircles;
    }
    if (this.linesObject) {
      this.linesObject.visible = look.showTrails;
    }
  }

  warmUp(steps: number, deltaSeconds: number, flow: FlowParams, topology: TopologyParams, look: LookParams): void {
    for (let i = 0; i < steps; i += 1) {
      this.stepPositions(deltaSeconds, i * deltaSeconds, flow, topology, look);
    }
    this.refreshGeometry(look);
  }

  update(deltaSeconds: number, elapsedSeconds: number, flow: FlowParams, topology: TopologyParams, look: LookParams): void {
    if (!this.layout || !this.flowParams) {
      return;
    }
    this.stepPositions(deltaSeconds, elapsedSeconds, flow, topology, look);
    this.refreshGeometry(look);
  }

  seedEmitterBurst(
    emitterIndex: number,
    burstCount: number,
    flow: FlowParams,
    topology: TopologyParams,
    look: LookParams,
    elapsedSeconds: number,
  ): void {
    if (!this.layout) {
      return;
    }

    const emitter = this.layout.voids[emitterIndex];
    if (!emitter || !emitter.active || !emitter.emitter) {
      return;
    }

    const count = Math.max(1, Math.min(this.particleCount, Math.round(burstCount)));
    for (let i = 0; i < count; i += 1) {
      const particleIndex = Math.floor(Math.random() * this.particleCount);
      const spawnPoint = sampleEmitterSpawnForVoid(emitter, topology);
      this.respawnParticle(particleIndex, this.layout, flow, topology, look, elapsedSeconds, spawnPoint);
    }
    this.refreshGeometry(look);
  }

  dispose(): void {
    this.disposeGeometry();
    this.positions = new Float32Array();
    this.ages = new Float32Array();
    this.history = new Float32Array();
    this.heads = new Uint16Array();
  }

  private stepPositions(
    deltaSeconds: number,
    elapsedSeconds: number,
    flow: FlowParams,
    topology: TopologyParams,
    look: LookParams,
  ): void {
    const layout = this.layout;
    if (!layout) {
      return;
    }

    const fixedDelta = Math.min(deltaSeconds, 1 / 20);
    const substeps = 2;
    const dt = flow.integrationStep * (fixedDelta * 60) / substeps;

    for (let i = 0; i < this.particleCount; i += 1) {
      const index = i * 2;
      let x = this.positions[index];
      let y = this.positions[index + 1];
      let respawned = false;

      this.ages[i] += fixedDelta;
      if (this.ages[i] >= flow.particleLife) {
        this.respawnParticle(i, layout, flow, topology, look, elapsedSeconds);
        respawned = true;
        x = this.positions[index];
        y = this.positions[index + 1];
      }

      if (!respawned) {
        for (let step = 0; step < substeps; step += 1) {
          sampleField(x, y, elapsedSeconds + step * dt, layout, flow, topology, this.fieldVecA);
          const midX = x + this.fieldVecA.x * dt * 0.5;
          const midY = y + this.fieldVecA.y * dt * 0.5;
          sampleField(midX, midY, elapsedSeconds + step * dt + dt * 0.5, layout, flow, topology, this.fieldVecB);
          const fieldSpeed = Math.hypot(this.fieldVecB.x, this.fieldVecB.y);

          x += this.fieldVecB.x * dt;
          y += this.fieldVecB.y * dt;

          const bottomStallBand = y < -layout.halfHeight * 0.48;
          const centralStallBand = Math.abs(x) < layout.frameWidth * 0.22;
          if (fieldSpeed < 0.11 && bottomStallBand && centralStallBand) {
            this.respawnParticle(i, layout, flow, topology, look, elapsedSeconds);
            respawned = true;
            x = this.positions[index];
            y = this.positions[index + 1];
            break;
          }

          if (isOutsideFrame(x, y, layout) || isInsideAnyVoid(x, y, layout, topology)) {
            this.respawnParticle(i, layout, flow, topology, look, elapsedSeconds);
            respawned = true;
            x = this.positions[index];
            y = this.positions[index + 1];
            break;
          }
        }
      }

      if (!respawned) {
        this.positions[index] = x;
        this.positions[index + 1] = y;
        const nextHead = (this.heads[i] + 1) % this.trailLength;
        this.heads[i] = nextHead;
        const historyIndex = (i * this.trailLength + nextHead) * 2;
        this.history[historyIndex] = x;
        this.history[historyIndex + 1] = y;
      }
    }
  }

  private refreshGeometry(look: LookParams): void {
    const baseColor = new Color(look.lineColor);
    const trailMax = Math.max(1, this.trailLength - 1);
    const brightness = look.lineBrightness * look.contrast;
    const pointBrightness = brightness * 0.8;
    const showTrails = look.showTrails;

    let pointWrite = 0;
    let headWrite = 0;
    let lineWrite = 0;
    const headColor = new Color(look.headCircleColor);
    const headBrightness = Math.max(0.25, look.lineBrightness * 1.15);

    for (let i = 0; i < this.particleCount; i += 1) {
      const head = this.heads[i];
      let prevX = 0;
      let prevY = 0;

      for (let step = 0; step < this.trailLength; step += 1) {
        const historySlot = (head - step + this.trailLength) % this.trailLength;
        const historyIndex = (i * this.trailLength + historySlot) * 2;
        const x = this.history[historyIndex];
        const y = this.history[historyIndex + 1];
        const fade = showTrails
          ? Math.pow(1 - step / trailMax, 1.05 / Math.max(look.contrast, 0.25))
          : step === 0 ? 1 : 0;

        this.pointPositions[pointWrite] = x;
        this.pointPositions[pointWrite + 1] = y;
        this.pointPositions[pointWrite + 2] = 0;
        this.pointColors[pointWrite] = baseColor.r * pointBrightness * fade;
        this.pointColors[pointWrite + 1] = baseColor.g * pointBrightness * fade;
        this.pointColors[pointWrite + 2] = baseColor.b * pointBrightness * fade;
        pointWrite += 3;

        if (step === 0) {
          this.headPositions[headWrite] = x;
          this.headPositions[headWrite + 1] = y;
          this.headPositions[headWrite + 2] = 0.01;
          this.headColors[headWrite] = headColor.r * headBrightness;
          this.headColors[headWrite + 1] = headColor.g * headBrightness;
          this.headColors[headWrite + 2] = headColor.b * headBrightness;
          headWrite += 3;
        }

        if (showTrails && step > 0) {
          const aStrength = brightness * Math.pow(1 - (step - 1) / trailMax, 1.02);
          const bStrength = brightness * fade;

          this.linePositions[lineWrite] = prevX;
          this.linePositions[lineWrite + 1] = prevY;
          this.linePositions[lineWrite + 2] = 0;
          this.lineColors[lineWrite] = baseColor.r * aStrength;
          this.lineColors[lineWrite + 1] = baseColor.g * aStrength;
          this.lineColors[lineWrite + 2] = baseColor.b * aStrength;
          lineWrite += 3;

          this.linePositions[lineWrite] = x;
          this.linePositions[lineWrite + 1] = y;
          this.linePositions[lineWrite + 2] = 0;
          this.lineColors[lineWrite] = baseColor.r * bStrength;
          this.lineColors[lineWrite + 1] = baseColor.g * bStrength;
          this.lineColors[lineWrite + 2] = baseColor.b * bStrength;
          lineWrite += 3;
        }

        prevX = x;
        prevY = y;
      }
    }

    if (!showTrails) {
      this.lineColors.fill(0);
      this.linePositions.fill(0);
    }

    if (this.pointsGeometry && this.headGeometry && this.linesGeometry) {
      (this.pointsGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (this.pointsGeometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
      (this.headGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (this.headGeometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
      (this.linesGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (this.linesGeometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
    }
  }

  private respawnParticle(
    particleIndex: number,
    layout: ReferenceLayout,
    flow: FlowParams,
    topology: TopologyParams,
    look: LookParams,
    elapsedSeconds: number,
    spawnPointOverride?: MutableVec2,
  ): void {
    const index = particleIndex * 2;
    const spawnPoint = spawnPointOverride ?? (flow.spawnPreset === "balanced"
      ? sampleBalancedRespawn(layout, flow, topology, look)
      : sampleSideFedRespawn(layout, flow, topology, look));
    let x = spawnPoint.x;
    let y = spawnPoint.y;

    if (isInsideAnyVoid(x, y, layout, topology) || isOutsideFrame(x, y, layout, 0)) {
      x = randomRange(-layout.halfWidth * 0.8, layout.halfWidth * 0.8);
      y = randomRange(-layout.halfHeight * 0.8, layout.halfHeight * 0.8);
    }

    this.positions[index] = x;
    this.positions[index + 1] = y;
    this.ages[particleIndex] = randomRange(0, flow.particleLife * 0.45);

    sampleField(x, y, elapsedSeconds, layout, flow, topology, this.fieldVecA);
    this.positions[index] += this.fieldVecA.x * flow.respawnJitter * 0.25;
    this.positions[index + 1] += this.fieldVecA.y * flow.respawnJitter * 0.25;

    this.heads[particleIndex] = 0;
    for (let step = 0; step < this.trailLength; step += 1) {
      const historyIndex = (particleIndex * this.trailLength + step) * 2;
      this.history[historyIndex] = this.positions[index];
      this.history[historyIndex + 1] = this.positions[index + 1];
    }
  }

  private disposeGeometry(): void {
    if (this.pointsObject) {
      this.scene.remove(this.pointsObject);
      this.pointsObject = null;
    }
    if (this.headObject) {
      this.scene.remove(this.headObject);
      this.headObject = null;
    }
    if (this.linesObject) {
      this.scene.remove(this.linesObject);
      this.linesObject = null;
    }

    this.pointsGeometry?.dispose();
    this.pointsMaterial?.dispose();
    this.headGeometry?.dispose();
    this.headMaterial?.dispose();
    this.headTexture?.dispose();
    this.linesGeometry?.dispose();
    this.linesMaterial?.dispose();

    this.pointsGeometry = null;
    this.pointsMaterial = null;
    this.headGeometry = null;
    this.headMaterial = null;
    this.headTexture = null;
    this.linesGeometry = null;
    this.linesMaterial = null;
  }

  private updateHeadTexture(thickness: number): void {
    const nextTexture = this.createRingTexture(thickness);
    if (this.headMaterial) {
      this.headMaterial.map = nextTexture;
      this.headMaterial.alphaMap = nextTexture;
      this.headMaterial.needsUpdate = true;
    }
    this.headTexture?.dispose();
    this.headTexture = nextTexture;
  }

  private createRingTexture(thickness: number): CanvasTexture {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create head circle texture.");
    }

    const radius = size * 0.34;
    const clampedThickness = Math.max(0.06, Math.min(0.48, thickness));
    context.clearRect(0, 0, size, size);
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(2, radius * clampedThickness);
    context.beginPath();
    context.arc(size * 0.5, size * 0.5, radius, 0, Math.PI * 2);
    context.stroke();

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
}
