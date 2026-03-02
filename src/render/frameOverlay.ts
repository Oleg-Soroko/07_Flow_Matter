import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  CircleGeometry,
  Color,
  LinearFilter,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshStandardMaterial,
  Scene,
  SphereGeometry,
  Texture,
  TextureLoader,
} from "three";
import type { ReferenceLayout } from "../referenceLayout";
import type { LookParams, TopologyParams } from "../types";

export class FrameOverlay {
  private static readonly UNDERLAY_OPACITY = 0.88;
  private readonly scene: Scene;
  private readonly layout: ReferenceLayout;
  private frameHalfWidth: number;
  private frameHalfHeight: number;
  private frameGeometry: BufferGeometry | null = null;
  private frameMaterial: LineBasicMaterial | null = null;
  private frameObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private currentFrameChamfer = -1;
  private readonly underlayGeometry = new CircleGeometry(1, 96);
  private readonly underlayMaskTexture: Texture;
  private readonly underlayMaterial: MeshStandardMaterial;
  private readonly emitterUnderlayMaterial: MeshStandardMaterial;
  private readonly underlayMeshes: Mesh<CircleGeometry, MeshStandardMaterial>[] = [];
  private readonly voidMaterial = new MeshStandardMaterial({
    color: 0x050505,
    roughness: 0.94,
    metalness: 0.04,
    emissive: 0x020202,
    emissiveIntensity: 0.08,
    depthWrite: true,
    depthTest: true,
  });
  private readonly emitterVoidMaterial = new MeshStandardMaterial({
    color: 0xe4e4e4,
    roughness: 0.7,
    metalness: 0.14,
    emissive: 0x6a6a6a,
    emissiveIntensity: 0.14,
    depthWrite: true,
    depthTest: true,
  });
  private readonly voidGeometries: SphereGeometry[] = [];
  private readonly voidBasePositions: Float32Array[] = [];
  private readonly voidMeshes: Mesh<SphereGeometry, MeshStandardMaterial>[] = [];
  private readonly activeBlend: number[] = [];
  private readonly hoverPress: number[] = [];
  private readonly pressedState: boolean[] = [];
  private selectionGeometry: BufferGeometry | null = null;
  private selectionMaterial: LineBasicMaterial | null = null;
  private selectionObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private selectedVoidIndex: number | null = null;
  private hoveredVoidIndex: number | null = null;
  private suppressedHoveredVoidIndex: number | null = null;

  constructor(scene: Scene, layout: ReferenceLayout) {
    this.scene = scene;
    this.layout = layout;
    this.frameHalfWidth = layout.halfWidth;
    this.frameHalfHeight = layout.halfHeight;
    this.underlayMaskTexture = new TextureLoader().load("/mask.png");
    this.underlayMaskTexture.generateMipmaps = true;
    this.underlayMaskTexture.minFilter = LinearFilter;
    this.underlayMaskTexture.magFilter = LinearFilter;
    this.underlayMaskTexture.wrapS = ClampToEdgeWrapping;
    this.underlayMaskTexture.wrapT = ClampToEdgeWrapping;
    this.underlayMaterial = this.voidMaterial.clone();
    this.underlayMaterial.transparent = true;
    this.underlayMaterial.opacity = FrameOverlay.UNDERLAY_OPACITY;
    this.underlayMaterial.alphaMap = this.underlayMaskTexture;
    this.underlayMaterial.depthWrite = true;
    this.underlayMaterial.depthTest = true;
    this.emitterUnderlayMaterial = this.emitterVoidMaterial.clone();
    this.emitterUnderlayMaterial.transparent = true;
    this.emitterUnderlayMaterial.opacity = FrameOverlay.UNDERLAY_OPACITY;
    this.emitterUnderlayMaterial.alphaMap = this.underlayMaskTexture;
    this.emitterUnderlayMaterial.depthWrite = true;
    this.emitterUnderlayMaterial.depthTest = true;
    this.buildFrame();
    this.buildVoids();
  }

  update(look: LookParams, topology: TopologyParams): void {
    if (this.frameMaterial) {
      this.frameMaterial.color.set(look.frameColor);
      this.frameMaterial.opacity = look.frameOpacity;
    }

    this.updateFrameGeometry(look.frameBevel);

    const sphereColor = new Color(look.sphereColor);
    this.underlayMaterial.color.copy(sphereColor);
    this.underlayMaterial.roughness = look.sphereRoughness;
    this.underlayMaterial.metalness = look.sphereMetalness;
    this.underlayMaterial.emissive.copy(sphereColor);
    this.underlayMaterial.emissiveIntensity = 0.015 + look.sphereBrightness * 0.035;
    this.underlayMaterial.opacity = FrameOverlay.UNDERLAY_OPACITY;
    this.voidMaterial.color.copy(sphereColor);
    this.voidMaterial.roughness = look.sphereRoughness;
    this.voidMaterial.metalness = look.sphereMetalness;
    this.voidMaterial.emissive.copy(sphereColor);
    this.voidMaterial.emissiveIntensity = 0.015 + look.sphereBrightness * 0.035;

    const emitterColor = sphereColor.clone();
    emitterColor.setRGB(1 - emitterColor.r, 1 - emitterColor.g, 1 - emitterColor.b);
    emitterColor.lerp(new Color(0xffffff), 0.38);
    this.emitterUnderlayMaterial.color.copy(emitterColor);
    this.emitterUnderlayMaterial.roughness = Math.max(0.28, look.sphereRoughness * 0.72);
    this.emitterUnderlayMaterial.metalness = Math.max(0.14, look.sphereMetalness * 0.55);
    this.emitterUnderlayMaterial.emissive.copy(emitterColor);
    this.emitterUnderlayMaterial.emissiveIntensity = 0.05 + look.sphereBrightness * 0.08;
    this.emitterUnderlayMaterial.opacity = FrameOverlay.UNDERLAY_OPACITY;
    this.emitterVoidMaterial.color.copy(emitterColor);
    this.emitterVoidMaterial.roughness = Math.max(0.28, look.sphereRoughness * 0.72);
    this.emitterVoidMaterial.metalness = Math.max(0.14, look.sphereMetalness * 0.55);
    this.emitterVoidMaterial.emissive.copy(emitterColor);
    this.emitterVoidMaterial.emissiveIntensity = 0.05 + look.sphereBrightness * 0.08;

    for (let i = 0; i < this.voidMeshes.length; i += 1) {
      const underlayMesh = this.underlayMeshes[i];
      const voidMesh = this.voidMeshes[i];
      const voidNode = this.layout.voids[i];
      underlayMesh.material = voidNode.emitter ? this.emitterUnderlayMaterial : this.underlayMaterial;
      voidMesh.material = voidNode.emitter ? this.emitterVoidMaterial : this.voidMaterial;
      const targetBlend = voidNode.active ? 1 : 0;
      const blend = this.activeBlend[i] + (targetBlend - this.activeBlend[i]) * 0.36;
      this.activeBlend[i] = blend;
      const blendEase = blend * blend * (3 - 2 * blend);

      if (blendEase <= 0.002 && !voidNode.active) {
        underlayMesh.visible = false;
        voidMesh.visible = false;
        this.hoverPress[i] *= 0.7;
        continue;
      }

      underlayMesh.visible = true;
      voidMesh.visible = true;
      const radius = voidNode.baseRadius * topology.voidRadiusScale;
      const isHovered = blendEase > 0.08 && i === this.hoveredVoidIndex && i !== this.suppressedHoveredVoidIndex;
      const targetPress = (this.pressedState[i] || isHovered) ? 1 : 0;
      const press = this.hoverPress[i] + (targetPress - this.hoverPress[i]) * 0.18;
      this.hoverPress[i] = press;
      const spreadScale = 1 + press * 0.006;
      const verticalScale = 1 - press * 0.08;
      const collapse = 1 - blendEase;
      const sink = press * 0.08 + collapse * 0.22;
      const collapseWidth = 0.14 + blendEase * 0.86;
      const collapseHeight = 0.08 + blendEase * 0.92;

      this.updateVoidGeometry(i, press, collapse);

      underlayMesh.position.set(voidNode.x, voidNode.y, -0.03 - sink * 0.3);
      underlayMesh.scale.set(
        radius * (1.25 + press * 0.11) * collapseWidth,
        radius * (1.25 + press * 0.11) * collapseWidth,
        1,
      );
      voidMesh.position.set(voidNode.x, voidNode.y, 0.08 - sink);
      voidMesh.scale.set(
        radius * spreadScale * collapseWidth,
        radius * spreadScale * collapseWidth,
        radius * verticalScale * collapseHeight,
      );
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
        const selectedBlend = this.activeBlend[this.selectedVoidIndex] ?? 0;
        if (!selectedVoid.active || selectedBlend <= 0.08) {
          this.selectionObject.visible = false;
        } else {
          const radius = selectedVoid.baseRadius * topology.voidRadiusScale;
          this.selectionObject.visible = true;
          this.selectionObject.position.set(selectedVoid.x, selectedVoid.y, 0.04);
          this.selectionObject.scale.set(radius + 0.05, radius + 0.05, 1);
        }
      }
    }
  }

  setSelectedVoid(index: number | null): void {
    this.selectedVoidIndex = index;
    if (this.selectionObject && index === null) {
      this.selectionObject.visible = false;
    }
  }

  setHoveredVoid(index: number | null): void {
    this.hoveredVoidIndex = index;
  }

  setFrameSize(width: number, height: number): void {
    this.frameHalfWidth = width * 0.5;
    this.frameHalfHeight = height * 0.5;
    this.currentFrameChamfer = -1;
    this.updateFrameGeometry();
  }

  setPressedVoid(index: number, pressed: boolean): void {
    if (index >= 0 && index < this.pressedState.length) {
      this.pressedState[index] = pressed;
    }
  }

  clearPressedVoids(): void {
    this.pressedState.fill(false);
  }

  suppressHoveredVoid(index: number | null): void {
    this.suppressedHoveredVoidIndex = index;
  }

  releasePressInstant(index: number): void {
    if (index >= 0 && index < this.hoverPress.length) {
      this.hoverPress[index] = 0;
    }
  }

  dispose(): void {
    this.frameGeometry?.dispose();
    this.frameMaterial?.dispose();
    if (this.frameObject) {
      this.scene.remove(this.frameObject);
      this.frameObject = null;
    }
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
    this.pressedState.length = 0;
    this.underlayGeometry.dispose();
    this.underlayMaterial.dispose();
    this.emitterUnderlayMaterial.dispose();
    this.underlayMaskTexture.dispose();
    for (const geometry of this.voidGeometries) {
      geometry.dispose();
    }
    this.voidGeometries.length = 0;
    this.voidBasePositions.length = 0;
    this.voidMaterial.dispose();
    this.emitterVoidMaterial.dispose();
  }

  private buildFrame(): void {
    const vertices = new Float32Array(8 * 3);

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
    this.frameObject.renderOrder = 29;
    this.scene.add(this.frameObject);
    this.updateFrameGeometry();

    this.buildSelection();
  }

  private updateFrameGeometry(frameBevel = this.currentFrameChamfer < 0 ? 0 : this.currentFrameChamfer): void {
    if (!this.frameGeometry) {
      return;
    }

    const clampedBevel = Math.max(0, Math.min(1, frameBevel));
    if (Math.abs(clampedBevel - this.currentFrameChamfer) < 0.0005 && this.currentFrameChamfer >= 0) {
      return;
    }
    this.currentFrameChamfer = clampedBevel;

    const chamfer = Math.min(this.frameHalfWidth, this.frameHalfHeight) * 0.16 * clampedBevel;
    const w = this.frameHalfWidth;
    const h = this.frameHalfHeight;
    const positions = (this.frameGeometry.getAttribute("position") as BufferAttribute).array as Float32Array;

    const vertices = [
      [-w + chamfer, -h, 0.03],
      [w - chamfer, -h, 0.03],
      [w, -h + chamfer, 0.03],
      [w, h - chamfer, 0.03],
      [w - chamfer, h, 0.03],
      [-w + chamfer, h, 0.03],
      [-w, h - chamfer, 0.03],
      [-w, -h + chamfer, 0.03],
    ];

    for (let i = 0; i < vertices.length; i += 1) {
      const offset = i * 3;
      positions[offset] = vertices[i][0];
      positions[offset + 1] = vertices[i][1];
      positions[offset + 2] = vertices[i][2];
    }

    (this.frameGeometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    this.frameGeometry.computeBoundingSphere();
  }

  private buildVoids(): void {
    for (const voidNode of this.layout.voids) {
      const underlayMesh = new Mesh(this.underlayGeometry, this.underlayMaterial);
      underlayMesh.position.set(voidNode.x, voidNode.y, -0.02);
      underlayMesh.scale.set(voidNode.baseRadius * 1.25, voidNode.baseRadius * 1.25, 1);
      underlayMesh.frustumCulled = false;
      underlayMesh.renderOrder = -10;
      this.scene.add(underlayMesh);
      this.underlayMeshes.push(underlayMesh);
      this.activeBlend.push(voidNode.active ? 1 : 0);
      this.hoverPress.push(0);
      this.pressedState.push(false);

      const geometry = new SphereGeometry(1, 36, 28);
      this.voidGeometries.push(geometry);
      this.voidBasePositions.push(new Float32Array(geometry.attributes.position.array as ArrayLike<number>));

      const mesh = new Mesh(geometry, this.voidMaterial);
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

  private updateVoidGeometry(index: number, press: number, collapse: number): void {
    const geometry = this.voidGeometries[index];
    const basePositions = this.voidBasePositions[index];
    const positionAttribute = geometry.getAttribute("position");
    const positions = positionAttribute.array as Float32Array;

    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-5)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i < positions.length; i += 3) {
      const baseX = basePositions[i];
      const baseY = basePositions[i + 1];
      const baseZ = basePositions[i + 2];
      const radial = Math.sqrt(baseX * baseX + baseY * baseY);
      const topMask = smoothstep(0.02, 0.92, baseZ);
      const dentCore = Math.exp(-Math.pow(radial / 0.82, 2));
      const dentRing = Math.exp(-Math.pow((radial - 0.72) / 0.28, 2));
      const shoulderMask = smoothstep(0.15, 0.85, baseZ);
      const centerDent = press * 0.62 * topMask * dentCore;
      const rimLift = press * 0.095 * shoulderMask * dentRing;
      const bodySink = press * 0.074 * smoothstep(-0.2, 0.95, baseZ) + collapse * 0.12 * smoothstep(-0.4, 1, baseZ);
      const radialPull = 1 - press * 0.036 * topMask * dentCore - collapse * 0.08 * topMask;

      positions[i] = baseX * radialPull;
      positions[i + 1] = baseY * radialPull;
      positions[i + 2] = baseZ - centerDent + rimLift - bodySink;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
