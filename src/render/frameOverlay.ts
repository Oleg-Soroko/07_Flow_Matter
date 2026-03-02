import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from "three";
import type { ReferenceLayout } from "../referenceLayout";
import type { LookParams, TopologyParams } from "../types";

export class FrameOverlay {
  private readonly scene: Scene;
  private readonly layout: ReferenceLayout;
  private frameGeometry: BufferGeometry | null = null;
  private frameMaterial: LineBasicMaterial | null = null;
  private frameObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private readonly underlayGeometry = new PlaneGeometry(2, 2, 1, 1);
  private underlayTexture: CanvasTexture | null = null;
  private readonly underlayMaterial = new MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.94,
    metalness: 0.04,
    emissive: 0x020202,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    depthTest: false,
  });
  private underlaySoftness = 1;
  private readonly underlayMeshes: Mesh<PlaneGeometry, MeshStandardMaterial>[] = [];
  private readonly voidGeometry = new SphereGeometry(1, 36, 28);
  private readonly voidMaterial = new MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.94,
    metalness: 0.04,
    emissive: 0x020202,
    emissiveIntensity: 0.08,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
  });
  private readonly voidMeshes: Mesh<SphereGeometry, MeshStandardMaterial>[] = [];
  private selectionGeometry: BufferGeometry | null = null;
  private selectionMaterial: LineBasicMaterial | null = null;
  private selectionObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private selectedVoidIndex: number | null = null;

  constructor(scene: Scene, layout: ReferenceLayout) {
    this.scene = scene;
    this.layout = layout;
    this.buildFrame();
    this.buildVoids();
  }

  update(look: LookParams, topology: TopologyParams): void {
    if (this.frameMaterial) {
      this.frameMaterial.color.set(look.frameColor);
      this.frameMaterial.opacity = look.frameOpacity;
    }

    const sphereColor = new Color(look.sphereColor);
    this.underlayMaterial.color.copy(sphereColor);
    this.underlayMaterial.roughness = look.sphereRoughness;
    this.underlayMaterial.metalness = look.sphereMetalness;
    this.underlayMaterial.emissive.copy(sphereColor);
    this.underlayMaterial.emissiveIntensity = 0.01 + look.sphereBrightness * 0.028;
    this.underlayMaterial.opacity = look.haloOpacity;
    this.voidMaterial.color.copy(sphereColor);
    this.voidMaterial.roughness = look.sphereRoughness;
    this.voidMaterial.metalness = look.sphereMetalness;
    this.voidMaterial.emissive.copy(sphereColor);
    this.voidMaterial.emissiveIntensity = 0.015 + look.sphereBrightness * 0.035;

    if (!this.underlayTexture || Math.abs(this.underlaySoftness - look.haloSoftness) > 1e-4) {
      this.refreshUnderlayTexture(look.haloSoftness);
    }

    for (let i = 0; i < this.voidMeshes.length; i += 1) {
      const underlayMesh = this.underlayMeshes[i];
      const voidMesh = this.voidMeshes[i];
      const voidNode = this.layout.voids[i];
      const radius = voidNode.baseRadius * topology.voidRadiusScale;
      underlayMesh.position.set(voidNode.x, voidNode.y, -0.02);
      underlayMesh.scale.set(radius * 1.25, radius * 1.25, 1);
      voidMesh.position.set(voidNode.x, voidNode.y, 0.08);
      voidMesh.scale.set(radius, radius, radius);
    }

    if (this.selectionMaterial) {
      this.selectionMaterial.color.set(look.lineColor);
      this.selectionMaterial.opacity = Math.min(1, look.frameOpacity + 0.08);
    }

    if (this.selectionObject) {
      if (this.selectedVoidIndex === null) {
        this.selectionObject.visible = false;
      } else {
        const selectedVoid = this.layout.voids[this.selectedVoidIndex];
        const radius = selectedVoid.baseRadius * topology.voidRadiusScale;
        this.selectionObject.visible = true;
        this.selectionObject.position.set(selectedVoid.x, selectedVoid.y, 0.04);
        this.selectionObject.scale.set(radius + 0.05, radius + 0.05, 1);
      }
    }
  }

  setSelectedVoid(index: number | null): void {
    this.selectedVoidIndex = index;
    if (this.selectionObject && index === null) {
      this.selectionObject.visible = false;
    }
  }

  dispose(): void {
    if (this.frameObject) {
      this.scene.remove(this.frameObject);
      this.frameObject = null;
    }
    this.frameGeometry?.dispose();
    this.frameMaterial?.dispose();
    this.selectionGeometry?.dispose();
    this.selectionMaterial?.dispose();
    if (this.selectionObject) {
      this.scene.remove(this.selectionObject);
      this.selectionObject = null;
    }

    for (const underlayMesh of this.underlayMeshes) {
      this.scene.remove(underlayMesh);
    }
    for (const voidMesh of this.voidMeshes) {
      this.scene.remove(voidMesh);
    }
    this.underlayMeshes.length = 0;
    this.voidMeshes.length = 0;
    this.underlayGeometry.dispose();
    this.underlayTexture?.dispose();
    this.underlayMaterial.dispose();
    this.voidGeometry.dispose();
    this.voidMaterial.dispose();
  }

  private buildFrame(): void {
    const x0 = -this.layout.halfWidth;
    const x1 = this.layout.halfWidth;
    const y0 = -this.layout.halfHeight;
    const y1 = this.layout.halfHeight;

    const vertices = new Float32Array([
      x0, y0, 0.02,
      x1, y0, 0.02,
      x1, y1, 0.02,
      x0, y1, 0.02,
    ]);

    this.frameGeometry = new BufferGeometry();
    this.frameGeometry.setAttribute("position", new BufferAttribute(vertices, 3));
    this.frameMaterial = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: false,
    });
    this.frameObject = new LineLoop(this.frameGeometry, this.frameMaterial);
    this.frameObject.frustumCulled = false;
    this.frameObject.renderOrder = 30;
    this.scene.add(this.frameObject);

    this.buildSelection();
  }

  private buildVoids(): void {
    this.refreshUnderlayTexture(this.underlaySoftness);

    for (const voidNode of this.layout.voids) {
      const underlayMesh = new Mesh(this.underlayGeometry, this.underlayMaterial);
      underlayMesh.position.set(voidNode.x, voidNode.y, -0.02);
      underlayMesh.scale.set(voidNode.baseRadius * 1.25, voidNode.baseRadius * 1.25, 1);
      underlayMesh.frustumCulled = false;
      underlayMesh.renderOrder = -10;
      this.scene.add(underlayMesh);
      this.underlayMeshes.push(underlayMesh);

      const mesh = new Mesh(this.voidGeometry, this.voidMaterial);
      mesh.position.set(voidNode.x, voidNode.y, 0.08);
      mesh.scale.set(voidNode.baseRadius, voidNode.baseRadius, voidNode.baseRadius);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      this.scene.add(mesh);
      this.voidMeshes.push(mesh);
    }
  }

  private buildSelection(): void {
    const segments = 48;
    const vertices = new Float32Array(segments * 3);
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      vertices[i * 3] = Math.cos(angle);
      vertices[i * 3 + 1] = Math.sin(angle);
      vertices[i * 3 + 2] = 0.04;
    }

    this.selectionGeometry = new BufferGeometry();
    this.selectionGeometry.setAttribute("position", new BufferAttribute(vertices, 3));
    this.selectionMaterial = new LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
    });
    this.selectionObject = new LineLoop(this.selectionGeometry, this.selectionMaterial);
    this.selectionObject.visible = false;
    this.selectionObject.frustumCulled = false;
    this.selectionObject.renderOrder = 31;
    this.scene.add(this.selectionObject);
  }

  private refreshUnderlayTexture(softness: number): void {
    this.underlaySoftness = Math.max(0, Math.min(1.5, softness));
    this.underlayTexture?.dispose();
    this.underlayTexture = this.createUnderlayTextureForSoftness(this.underlaySoftness);
    this.underlayMaterial.alphaMap = this.underlayTexture;
    this.underlayMaterial.needsUpdate = true;
  }

  private createUnderlayTextureForSoftness(softness: number): CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create sphere underlay texture.");
    }

    context.clearRect(0, 0, size, size);

    const imageData = context.createImageData(size, size);
    const data = imageData.data;
    const center = size * 0.5;
    const softnessNorm = Math.max(0, Math.min(1, softness / 1.5));
    const innerFalloffStart = 0.18 + softnessNorm * 0.10;
    const outerFadeStart = 0.72 - softnessNorm * 0.16;
    const outerRadius = 1.0;
    const peakAlpha = 0.36 - softnessNorm * 0.08;

    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-5)));
      return t * t * (3 - 2 * t);
    };

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x + 0.5 - center) / center;
        const dy = (y + 0.5 - center) / center;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let alpha = 0;
        if (distance < outerRadius) {
          const centerFade = 1 - smoothstep(0, innerFalloffStart, distance);
          const edgeFade = 1 - smoothstep(outerFadeStart, outerRadius, distance);
          alpha = Math.max(0, Math.min(1, Math.max(centerFade * 0.18, edgeFade) * peakAlpha));
        }

        const index = (y * size + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.round(alpha * 255);
      }
    }

    context.putImageData(imageData, 0, 0);

    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }
}
