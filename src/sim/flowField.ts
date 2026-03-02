import type { ReferenceChannel, ReferenceLayout, ReferenceVoid } from "../referenceLayout";
import type { FlowParams, TopologyParams } from "../types";

export interface MutableVec2 {
  x: number;
  y: number;
}

const LOOP_DURATION_SECONDS = 0.6;
const TAU = Math.PI * 2;

const pointSegmentNearest = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  out: MutableVec2,
  tangent: MutableVec2,
): number => {
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby;
  const t = denom > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / denom)) : 0;
  out.x = ax + abx * t;
  out.y = ay + aby * t;
  const length = Math.hypot(abx, aby) || 1;
  tangent.x = abx / length;
  tangent.y = aby / length;
  const dx = px - out.x;
  const dy = py - out.y;
  return dx * dx + dy * dy;
};

const nearestPointOnChannel = (
  channel: ReferenceChannel,
  x: number,
  y: number,
  nearest: MutableVec2,
  tangent: MutableVec2,
): number => {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  const testNearest = { x: 0, y: 0 };
  const testTangent = { x: 0, y: 0 };

  for (let i = 0; i < channel.points.length - 1; i += 1) {
    const a = channel.points[i];
    const b = channel.points[i + 1];
    const distanceSq = pointSegmentNearest(x, y, a.x, a.y, b.x, b.y, testNearest, testTangent);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      nearest.x = testNearest.x;
      nearest.y = testNearest.y;
      tangent.x = testTangent.x;
      tangent.y = testTangent.y;
    }
  }

  return Math.sqrt(bestDistanceSq);
};

const addVoidForce = (
  out: MutableVec2,
  x: number,
  y: number,
  timePhase: number,
  topology: TopologyParams,
  voidNode: ReferenceVoid,
): void => {
  const dx = x - voidNode.x;
  const dy = y - voidNode.y;
  const distance = Math.hypot(dx, dy) || 1e-5;
  const radius = voidNode.baseRadius * topology.voidRadiusScale;
  const shell = distance - radius;
  const nx = dx / distance;
  const ny = dy / distance;
  const reach = radius + voidNode.influence;

  if (distance >= reach) {
    return;
  }

  const outside = Math.max(shell, 0);
  const repelWeight = Math.exp(-(outside * outside) / Math.max(1e-5, voidNode.influence * voidNode.influence));
  const insideWeight = distance < radius ? 1 + (radius - distance) / Math.max(radius, 1e-5) : 0;
  const repel = topology.voidRepel * (repelWeight * 0.62 + insideWeight * 1.3);

  out.x += nx * repel;
  out.y += ny * repel;

  const ringWidthWorld = Math.max(0.04, topology.ringWidth * 2.4);
  const ringTarget = radius + ringWidthWorld * 0.55;
  const ringDelta = distance - ringTarget;
  const ringWeight = Math.exp(-(ringDelta * ringDelta) / Math.max(1e-5, ringWidthWorld * ringWidthWorld));
  const shimmer = 1 + Math.sin(timePhase + voidNode.spin * 0.8 + distance * 2.2) * topology.ringWidth;
  const ringStrength = topology.ringVorticity * ringWeight * shimmer;

  out.x += -ny * ringStrength * voidNode.spin;
  out.y += nx * ringStrength * voidNode.spin;
};

export const isInsideAnyVoid = (
  x: number,
  y: number,
  layout: ReferenceLayout,
  topology: TopologyParams,
): boolean => {
  for (const voidNode of layout.voids) {
    if (!voidNode.active) {
      continue;
    }
    const radius = voidNode.baseRadius * topology.voidRadiusScale;
    const dx = x - voidNode.x;
    const dy = y - voidNode.y;
    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
  }
  return false;
};

export const isOutsideFrame = (x: number, y: number, layout: ReferenceLayout, margin = 0.06): boolean => {
  return (
    x < -layout.halfWidth - margin ||
    x > layout.halfWidth + margin ||
    y < -layout.halfHeight - margin ||
    y > layout.halfHeight + margin
  );
};

export const sampleField = (
  x: number,
  y: number,
  timeSeconds: number,
  layout: ReferenceLayout,
  flow: FlowParams,
  topology: TopologyParams,
  out: MutableVec2,
): MutableVec2 => {
  out.x = 0;
  out.y = 0;

  const phase = TAU * (timeSeconds / LOOP_DURATION_SECONDS) * flow.loopSpeed;
  const channelNearest = { x: 0, y: 0 };
  const channelTangent = { x: 0, y: 0 };

  for (const channel of layout.channels) {
    const distance = nearestPointOnChannel(channel, x, y, channelNearest, channelTangent);
    const radius = Math.max(0.08, channel.radius);
    const weight = Math.exp(-(distance * distance) / (radius * radius));
    const mod = 1 + Math.sin(phase + channel.phase) * flow.loopAmount * 0.28;
    const dx = channelNearest.x - x;
    const dy = channelNearest.y - y;

    out.x += dx * topology.channelPull * channel.pull * weight * 0.72;
    out.y += dy * topology.channelPull * channel.pull * weight * 0.72;
    out.x += channelTangent.x * topology.channelFlow * channel.flow * weight * mod;
    out.y += channelTangent.y * topology.channelFlow * channel.flow * weight * mod;
  }

  for (const voidNode of layout.voids) {
    if (!voidNode.active) {
      continue;
    }
    addVoidForce(out, x, y, phase, topology, voidNode);
  }

  const sideRatio = Math.abs(x) / Math.max(layout.halfWidth, 1e-5);
  const sideBand = Math.max(0, sideRatio - 0.38) / 0.62;
  const sideWeight = sideBand * sideBand;
  const sideMod = 0.82 + 0.18 * Math.cos(y * 1.4 - phase * 0.07);
  out.x += -Math.sign(x || 1) * topology.sideInflow * sideWeight * sideMod;

  const spineWeight = Math.exp(-(x * x) / Math.max(1e-5, layout.frameWidth * 0.12));
  out.x += -x * topology.spineStrength * spineWeight * 0.45;
  out.y += -y * topology.spineStrength * spineWeight * 0.08;

  const edgeBandX = Math.max(0, Math.abs(x) - layout.halfWidth * 0.78) / Math.max(layout.halfWidth * 0.22, 1e-5);
  const edgeBandY = Math.max(0, Math.abs(y) - layout.halfHeight * 0.84) / Math.max(layout.halfHeight * 0.16, 1e-5);
  out.x += -Math.sign(x || 1) * edgeBandX * edgeBandX * topology.edgeFade * 0.85;
  out.y += -Math.sign(y || 1) * edgeBandY * edgeBandY * topology.edgeFade * 0.85;

  const noiseScale = Math.max(0.2, topology.backgroundNoiseScale);
  const noisePhase = phase * Math.max(0, topology.backgroundNoiseSpeed);
  const curlA =
    Math.sin(y * 2.15 * noiseScale + noisePhase * 0.12) +
    0.45 * Math.sin((x + y) * 2.9 * noiseScale - noisePhase * 0.08);
  const curlB =
    Math.cos(x * 2.35 * noiseScale - noisePhase * 0.11) +
    0.45 * Math.cos((x - y) * 2.55 * noiseScale + noisePhase * 0.09);
  out.x += topology.backgroundCurl * curlA * 0.22;
  out.y += topology.backgroundCurl * curlB * 0.22;

  const length = Math.hypot(out.x, out.y);
  if (length > 4) {
    const scale = 4 / length;
    out.x *= scale;
    out.y *= scale;
  }

  return out;
};
