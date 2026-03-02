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
  private frameGeometry: BufferGeometry | null = null;
  private frameMaterial: LineBasicMaterial | null = null;
  private frameObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private readonly underlayGeometry = new CircleGeometry(1, 96);
  private readonly underlayMaskTexture: Texture;
  private readonly underlayMaterial: MeshStandardMaterial;
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
  private readonly voidGeometries: SphereGeometry[] = [];
  private readonly voidBasePositions: Float32Array[] = [];
  private readonly voidMeshes: Mesh<SphereGeometry, MeshStandardMaterial>[] = [];
  private readonly activeBlend: number[] = [];
  private readonly hoverPress: number[] = [];
  private selectionGeometry: BufferGeometry | null = null;
  private selectionMaterial: LineBasicMaterial | null = null;
  private selectionObject: LineLoop<BufferGeometry, LineBasicMaterial> | null = null;
  private selectedVoidIndex: number | null = null;
  private hoveredVoidIndex: number | null = null;

  constructor(scene: Scene, layout: ReferenceLayout) {
    this.scene = scene;
    this.layout = layout;
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
    this.underlayMaterial.emissiveIntensity = 0.015 + look.sphereBrightness * 0.035;
    this.underlayMaterial.opacity = FrameOverlay.UNDERLAY_OPACITY;
    this.voidMaterial.color.copy(sphereColor);
    this.voidMaterial.roughness = look.sphereRoughness;
    this.voidMaterial.metalness = look.sphereMetalness;
    this.voidMaterial.emissive.copy(sphereColor);
    this.voidMaterial.emissiveIntensity = 0.015 + look.sphereBrightness * 0.035;

    for (let i = 0; i < this.voidMeshes.length; i += 1) {
      const underlayMesh = this.underlayMeshes[i];
      const voidMesh = this.voidMeshes[i];
      const voidNode = this.layout.voids[i];
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
      const targetPress = blendEase > 0.08 && i === this.hoveredVoidIndex ? 1 : 0;
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
    this.underlayMaterial.dispose();
    this.underlayMaskTexture.dispose();
    for (const geometry of this.voidGeometries) {
      geometry.dispose();
    }
    this.voidGeometries.length = 0;
    this.voidBasePositions.length = 0;
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
