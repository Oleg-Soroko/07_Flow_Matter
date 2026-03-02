import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Scene,
} from "three";
import type { ReferenceLayout } from "../referenceLayout";
import type { FlowParams, TopologyParams } from "../types";
import { sampleField, type MutableVec2 } from "../sim/flowField";

export class FieldDebugOverlay {
  private readonly scene: Scene;
  private readonly layout: ReferenceLayout;
  private readonly columns: number;
  private readonly rows: number;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;
  private readonly object: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly fieldOut: MutableVec2 = { x: 0, y: 0 };

  constructor(scene: Scene, layout: ReferenceLayout) {
    this.scene = scene;
    this.layout = layout;

    const maxDimension = Math.max(layout.frameWidth, layout.frameHeight, 1e-5);
    this.columns = Math.max(18, Math.round((layout.frameWidth / maxDimension) * 26));
    this.rows = Math.max(18, Math.round((layout.frameHeight / maxDimension) * 26));

    const vertexCount = this.columns * this.rows * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new BufferAttribute(this.colors, 3));

    this.material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      depthTest: false,
    });

    this.object = new LineSegments(this.geometry, this.material);
    this.object.visible = false;
    this.object.frustumCulled = false;
    this.object.renderOrder = 60;
    this.scene.add(this.object);
  }

  setVisible(visible: boolean): void {
    this.object.visible = visible;
  }

  update(elapsedSeconds: number, flow: FlowParams, topology: TopologyParams): void {
    if (!this.object.visible) {
      return;
    }

    const spacingX = this.layout.frameWidth / Math.max(this.columns - 1, 1);
    const spacingY = this.layout.frameHeight / Math.max(this.rows - 1, 1);
    const baseLength = Math.min(spacingX, spacingY) * 0.42;
    const neutral = new Color(0x35475b);
    const active = new Color(0xd7ecff);

    let write = 0;
    for (let row = 0; row < this.rows; row += 1) {
      const v = this.rows === 1 ? 0.5 : row / (this.rows - 1);
      const y = this.layout.halfHeight - v * this.layout.frameHeight;
      for (let col = 0; col < this.columns; col += 1) {
        const u = this.columns === 1 ? 0.5 : col / (this.columns - 1);
        const x = -this.layout.halfWidth + u * this.layout.frameWidth;
        sampleField(x, y, elapsedSeconds, this.layout, flow, topology, this.fieldOut);

        const length = Math.hypot(this.fieldOut.x, this.fieldOut.y);
        const invLength = length > 1e-5 ? 1 / length : 0;
        const dx = this.fieldOut.x * invLength;
        const dy = this.fieldOut.y * invLength;
        const lineLength = baseLength * (0.35 + Math.min(1, length / 2.8) * 0.95);
        const startX = x - dx * lineLength * 0.35;
        const startY = y - dy * lineLength * 0.35;
        const endX = x + dx * lineLength;
        const endY = y + dy * lineLength;
        const color = neutral.clone().lerp(active, Math.min(1, length / 2.6));

        this.positions[write] = startX;
        this.positions[write + 1] = startY;
        this.positions[write + 2] = 0.02;
        this.colors[write] = color.r;
        this.colors[write + 1] = color.g;
        this.colors[write + 2] = color.b;
        write += 3;

        this.positions[write] = endX;
        this.positions[write + 1] = endY;
        this.positions[write + 2] = 0.02;
        this.colors[write] = color.r;
        this.colors[write + 1] = color.g;
        this.colors[write + 2] = color.b;
        write += 3;
      }
    }

    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.geometry.dispose();
    this.material.dispose();
  }
}
