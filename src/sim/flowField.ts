import type { ReferenceChannel, ReferenceLayout, ReferenceVoid } from "../referenceLayout";
import type { FlowParams, TopologyParams } from "../types";

export interface MutableVec2 {
  x: number;
  y: number;
}

const LOOP_DURATION_SECONDS = 0.6;
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 1e-5));
  return t * t * (3 - 2 * t);
};

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
  smoothness: number,
): number => {
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  const testNearest = { x: 0, y: 0 };
  const testTangent = { x: 0, y: 0 };
  const smoothedNearest = { x: 0, y: 0 };
  const smoothedTangent = { x: 0, y: 0 };
  let blendWeightTotal = 0;
  const blendRadius = Math.max(1e-4, channel.radius * (0.38 + smoothness * 1.65));
  const blendRadiusSq = blendRadius * blendRadius;

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

    const blendWeight = Math.exp(-distanceSq / blendRadiusSq);
    smoothedNearest.x += testNearest.x * blendWeight;
    smoothedNearest.y += testNearest.y * blendWeight;
    smoothedTangent.x += testTangent.x * blendWeight;
    smoothedTangent.y += testTangent.y * blendWeight;
    blendWeightTotal += blendWeight;
  }

  if (blendWeightTotal > 1e-5) {
    const blendMix = clamp01(smoothness);
    const averagedNearestX = smoothedNearest.x / blendWeightTotal;
    const averagedNearestY = smoothedNearest.y / blendWeightTotal;
    const averagedTangentX = smoothedTangent.x / blendWeightTotal;
    const averagedTangentY = smoothedTangent.y / blendWeightTotal;
    const averagedTangentLength = Math.hypot(averagedTangentX, averagedTangentY) || 1;

    nearest.x += (averagedNearestX - nearest.x) * blendMix;
    nearest.y += (averagedNearestY - nearest.y) * blendMix;
    tangent.x += ((averagedTangentX / averagedTangentLength) - tangent.x) * blendMix;
    tangent.y += ((averagedTangentY / averagedTangentLength) - tangent.y) * blendMix;
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
  let channelCoverage = 0;
  let channelWeightTotal = 0;
  let channelPullX = 0;
  let channelPullY = 0;
  let channelFlowX = 0;
  let channelFlowY = 0;

  for (const channel of layout.channels) {
    const smoothness = clamp01(topology.channelSmoothness);
    const distance = nearestPointOnChannel(channel, x, y, channelNearest, channelTangent, smoothness);
    const radius = Math.max(0.08, channel.radius) * (1 + smoothness * 0.95);
    const weight = Math.exp(-(distance * distance) / (radius * radius));
    const smoothWeight = Math.pow(weight, 1.06 - smoothness * 0.52);
    const mod = 1 + Math.sin(phase + channel.phase) * flow.loopAmount * 0.14;
    const dx = channelNearest.x - x;
    const dy = channelNearest.y - y;
    const channelWeight = clamp01(smoothWeight);

    channelPullX += dx * topology.channelPull * channel.pull * channelWeight;
    channelPullY += dy * topology.channelPull * channel.pull * channelWeight;
    channelFlowX += channelTangent.x * topology.channelFlow * channel.flow * channelWeight * mod;
    channelFlowY += channelTangent.y * topology.channelFlow * channel.flow * channelWeight * mod;
    channelWeightTotal += channelWeight;
    channelCoverage = 1 - (1 - channelCoverage) * (1 - clamp01(smoothWeight * 0.44));
  }

  if (channelWeightTotal > 1e-5) {
    const normalizedWeight = 1 - Math.exp(-channelWeightTotal * 0.9);
    const overlapWeight = clamp01((channelWeightTotal - 1) / 1.4);
    const pullMix = 0.52 * (1 - overlapWeight * 0.82);
    const flowMix = 1 + overlapWeight * 0.34;
    out.x += ((channelPullX / channelWeightTotal) * pullMix + (channelFlowX / channelWeightTotal) * flowMix) * normalizedWeight;
    out.y += ((channelPullY / channelWeightTotal) * pullMix + (channelFlowY / channelWeightTotal) * flowMix) * normalizedWeight;
  }

  for (const voidNode of layout.voids) {
    if (!voidNode.active) {
      continue;
    }
    addVoidForce(out, x, y, phase, topology, voidNode);
  }

  const sideRatio = Math.abs(x) / Math.max(layout.halfWidth, 1e-5);
  const sideWeight = smoothstep(0.28, 0.96, sideRatio);
  const sideMod = 0.82 + 0.18 * Math.cos(y * 1.4 - phase * 0.07);
  out.x += -(x / Math.max(layout.halfWidth, 1e-5)) * topology.sideInflow * sideWeight * sideMod;

  const spineWeight = Math.exp(-(x * x) / Math.max(1e-5, layout.frameWidth * 0.12));
  out.x += -x * topology.spineStrength * spineWeight * 0.45;

  const edgeBandX = smoothstep(layout.halfWidth * 0.72, layout.halfWidth * 0.99, Math.abs(x));
  const edgeBandY = smoothstep(layout.halfHeight * 0.8, layout.halfHeight * 0.99, Math.abs(y));
  const topBand = smoothstep(layout.halfHeight * 0.35, layout.halfHeight * 0.98, y);
  out.x += -(x / Math.max(layout.halfWidth, 1e-5)) * edgeBandX * topology.edgeFade * 0.85;
  out.y += -(y / Math.max(layout.halfHeight, 1e-5)) * edgeBandY * topology.edgeFade * 0.85;

  const bottomBand = 1 - smoothstep(-layout.halfHeight * 0.86, -layout.halfHeight * 0.42, y);
  const bottomCenter = 1 - smoothstep(layout.frameWidth * 0.14, layout.frameWidth * 0.38, Math.abs(x));
  const outletWeight = bottomBand * bottomCenter;
  if (outletWeight > 0) {
    const splitX = x / Math.max(layout.frameWidth * 0.12, 1e-5);
    const lateralOut = Math.tanh(splitX) * (0.34 + topology.channelFlow * 0.42);
    const downwardOut = 0.62 + topology.edgeFade * 0.46;
    out.x += lateralOut * outletWeight;
    out.y += -downwardOut * outletWeight;
  }

  const noiseScale = Math.max(0.2, topology.backgroundNoiseScale);
  const noisePhase = phase * Math.max(0, topology.backgroundNoiseSpeed);
  const roughness = clamp01(topology.backgroundNoiseRoughness);
  const protectedFieldWeight = clamp01(channelCoverage + spineWeight * 0.24);
  const openFieldWeight = 1 - smoothstep(0.08, 0.86, protectedFieldWeight);
  const detailScale = noiseScale * (1.18 + roughness * 2.6);
  const detailAmount = 0.06 + roughness * 0.22;
  const macroAmount = 0.42 - roughness * 0.14;
  const detailPhase = noisePhase * (0.42 + roughness * 0.64);
  const macroPhase = noisePhase * 0.12;

  const detailCurlA =
    Math.sin(y * 1.85 * detailScale + detailPhase) +
    0.42 * Math.sin((x + y * 0.85) * 2.05 * detailScale - detailPhase * 0.78);
  const detailCurlB =
    Math.cos(x * 1.9 * detailScale - detailPhase) +
    0.42 * Math.cos((x * 0.82 - y) * 1.95 * detailScale + detailPhase * 0.82);

  const macroScale = Math.max(0.1, noiseScale * 0.44);
  const macroCurlA =
    Math.sin(y * 0.62 * macroScale + macroPhase) +
    0.34 * Math.sin((x + y) * 0.88 * macroScale - macroPhase * 0.5);
  const macroCurlB =
    Math.cos(x * 0.67 * macroScale - macroPhase) +
    0.34 * Math.cos((x - y) * 0.92 * macroScale + macroPhase * 0.54);

  const outerBoost = openFieldWeight * (0.74 + sideWeight * 0.42 + topBand * 0.3);
  out.x += topology.backgroundCurl * outerBoost * (macroCurlA * macroAmount + detailCurlA * detailAmount);
  out.y += topology.backgroundCurl * outerBoost * (macroCurlB * macroAmount + detailCurlB * detailAmount);

  const length = Math.hypot(out.x, out.y);
  if (length > 4) {
    const scale = 4 / length;
    out.x *= scale;
    out.y *= scale;
  }

  return out;
};
