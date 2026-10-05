import {
  coatedPose,
  flatCoatedPose,
  maskBlocksRay,
  opticHighFromSag,
  radiusFromSag,
  maskHalfAngleRadians,
  orbitsToAverage,
  oscillatedTargetEmitters,
  plusMinusPercent,
  thicknessProfile,
  type CoatingInputs,
  type RadialSample,
  type UniformityMask,
} from "./coating";

/** Mask plates sit near the part (within MASK_NEAR_MM of the glass). */
export type MaskPlacement = "substrate";

/** How far from the glass still counts as "near the part", in millimeters. */
const MASK_NEAR_MM = 101.6;

export function maskGapLimits(
  throwDistance: number,
  _placement: MaskPlacement = "substrate",
  opticHighMm = 0,
): { min: number; max: number } {
  const high = Number.isFinite(opticHighMm) ? Math.max(0, opticHighMm) : 0;
  const room = throwDistance - 3.81 - high;
  return { min: 2.54, max: Math.min(MASK_NEAR_MM, room) };
}

/**
 * Gaps to try, in millimeters of clearance from the glass nearest the target.
 * The plate stays within 101.6 mm of that glass. A raised center shortens the
 * room above it.
 */
export function maskSearchGaps(
  throwDistance: number,
  placement: MaskPlacement = "substrate",
  opticHighMm = 0,
): number[] {
  const { min, max } = maskGapLimits(throwDistance, placement, opticHighMm);
  if (!(max > min + 1)) return [];
  const seeds = [2.54, 12.7, 25.4, 38.1, 50.8, 63.5, 76.2, 88.9, 101.6];
  const gaps = seeds
    .filter((gap) => gap >= min - 1e-6 && gap <= max + 1e-6)
    .map((gap) => Number(Math.min(gap, max).toFixed(2)))
    .filter((gap) => gap > 1.27 && gap <= max + 1e-6);
  return [...new Set(gaps)].sort((left, right) => left - right);
}

/** Aim for this ±% or better, then keep as much coat rate as possible. */
export const MASK_UNIFORMITY_TARGET_PERCENT = 0.5;

/** Which already-thin place the search tries to leave open. */
export type MaskBias = "open-rim" | "open-center" | "none";

export type MaskGapScore = {
  offsetIn: number;
  plusMinusPercent: number;
  /** Fraction of unmasked coat flux that still reaches the part. */
  retainedFraction: number;
  /** Fraction of unmasked center flux still getting through. */
  centerRetained: number;
  /** Fraction of unmasked rim flux still getting through. */
  edgeRetained: number;
  radiiIn: number[];
  halfAngleDeg: number[];
};

export type MaskDesign = {
  offsetIn: number;
  mask: UniformityMask;
  beforePlusMinusPercent: number;
  afterPlusMinusPercent: number;
  /** Fraction of unmasked coat flux kept with this plate. */
  retainedFraction: number;
  centerRetained: number;
  edgeRetained: number;
  beforePoints: RadialSample[];
  afterPoints: RadialSample[];
  gaps: MaskGapScore[];
  /** Which end of the gap the search was allowed to use. */
  placement: MaskPlacement;
  /** True when the mask beats the unmasked film on the full average. */
  improved: boolean;
  /** True when the plate meets the ±0.5% aim. */
  meetsTarget: boolean;
  /** open-rim for center-thick (convex); open-center for edge-thick (concave). */
  bias: MaskBias;
  shapeText: string;
};

type ShapeScore = {
  plusMinusPercent: number;
  retainedFraction: number;
  centerRetained: number;
  edgeRetained: number;
};

const SEARCH_STEPS = [
  0, 0.05, 0.1, 0.15, 0.25, 0.4, 0.7, 1.2, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 35,
];

/** From the unmasked radial curve: trim the thick place, leave the thin place open. */
export function maskBiasFromProfile(points: RadialSample[]): MaskBias {
  if (points.length < 2) return "none";
  const center = points[0]?.planetary ?? 1;
  const edge = points[points.length - 1]?.planetary ?? 1;
  if (!(Number.isFinite(center) && Number.isFinite(edge) && center > 0)) return "none";
  if (edge < center - 0.01) return "open-rim";
  if (edge > center + 0.01) return "open-center";
  return "none";
}

function thinRetained(score: ShapeScore, bias: MaskBias): number {
  if (bias === "open-rim") return score.edgeRetained;
  if (bias === "open-center") return score.centerRetained;
  return score.retainedFraction;
}

function thickRetained(score: ShapeScore, bias: MaskBias): number {
  if (bias === "open-rim") return score.centerRetained;
  if (bias === "open-center") return score.edgeRetained;
  return score.retainedFraction;
}

/** Lower is better. Rewards meeting ±0.5%, then selective trim of the thick place. */
function maskCost(score: ShapeScore, bias: MaskBias): number {
  const over = Math.max(0, score.plusMinusPercent - MASK_UNIFORMITY_TARGET_PERCENT);
  if (bias === "none") {
    if (over <= 1e-12) {
      return -1000 - score.retainedFraction - 0.001 * (1 - score.plusMinusPercent);
    }
    // No thick/thin cue: flatten first, then keep rate.
    return over - 0.01 * score.retainedFraction;
  }
  const thin = thinRetained(score, bias);
  const thick = thickRetained(score, bias);
  const selectivity = thin - thick;
  // Convex (open-rim): center must lose clearly more than the rim. Concave
  // (open-center): the reverse. A near-uniform plate fails this even if ±% is flatter.
  const thickBlocked = 1 - thick;
  const thinBlocked = 1 - thin;
  const blockRatio = thickBlocked / Math.max(1e-6, thinBlocked);
  const weakSelectivity = Math.max(0, 1.4 - blockRatio);
  if (over <= 1e-12) {
    // Meet the aim: keep the thin place open, then stay selective, then keep rate.
    return (
      -1000 -
      20 * thin -
      20 * Math.max(0, selectivity) -
      score.retainedFraction +
      20 * weakSelectivity
    );
  }
  // Miss the aim: prefer a selective center-trim (or rim-trim) over a slightly
  // flatter plate that blocks almost the same fraction everywhere.
  return (
    2.5 * over -
    55 * selectivity -
    12 * thin -
    0.25 * score.retainedFraction +
    25 * weakSelectivity
  );
}

/**
 * Prefer a plate that meets ±0.5%. Among those, leave the already-thin place
 * more open (rim open on convex / center-thick; center open on concave) so the
 * thick place takes the trim. If neither meets the aim, prefer selective trim
 * over a slightly flatter but nearly uniform block.
 */
export function preferMaskScore(
  candidate: ShapeScore,
  incumbent: ShapeScore,
  bias: MaskBias = "none",
): boolean {
  return maskCost(candidate, bias) < maskCost(incumbent, bias) - 1e-9;
}

function retainedFromProfiles(
  before: RadialSample[],
  after: RadialSample[],
): { retainedFraction: number; centerRetained: number; edgeRetained: number } {
  let open = 0;
  let kept = 0;
  const count = Math.min(before.length, after.length);
  for (let index = 0; index < count; index++) {
    open += before[index]?.planetaryFlux ?? 0;
    kept += after[index]?.planetaryFlux ?? 0;
  }
  const centerOpen = before[0]?.planetaryFlux ?? 0;
  const centerKept = after[0]?.planetaryFlux ?? 0;
  const edgeOpen = before[count - 1]?.planetaryFlux ?? 0;
  const edgeKept = after[count - 1]?.planetaryFlux ?? 0;
  return {
    retainedFraction: open > 0 ? kept / open : 1,
    centerRetained: centerOpen > 0 ? centerKept / centerOpen : 1,
    edgeRetained: edgeOpen > 0 ? edgeKept / edgeOpen : 1,
  };
}

function partRadii(partDiameter: number, count: number): number[] {
  const outer = Math.max(0, partDiameter) / 2;
  const radii: number[] = [];
  const safe = Math.max(2, count);
  for (let index = 0; index < safe; index++) {
    radii.push((outer * index) / (safe - 1));
  }
  return radii;
}

function partOrbit(input: CoatingInputs): { orbit: number; partRadius: number } {
  return {
    orbit: Math.abs(input.orbitRadius),
    partRadius: Math.max(12.7, Math.max(0, input.partDiameter) / 2),
  };
}

/**
 * Knots for the finger outline. Center-thick (open-rim) coats use knots across
 * the part only so a pear can sit fat at the part center and taper to both rims.
 */
function knotRadii(
  input: CoatingInputs,
  offsetIn: number,
  bias: MaskBias = "none",
): number[] {
  const { orbit, partRadius } = partOrbit(input);
  if (bias === "open-rim") {
    const inner = Math.max(5.08, orbit - partRadius);
    const outer = orbit + partRadius;
    const count = 9;
    const radii: number[] = [];
    for (let index = 0; index < count; index++) {
      radii.push(inner + ((outer - inner) * index) / (count - 1));
    }
    return radii;
  }
  const throwDistance = input.throwDistance;
  const along = throwDistance > 0 ? offsetIn / throwDistance : 0;
  const source = Math.abs(input.sourceOffset);
  const innerPart = Math.max(0, orbit - partRadius);
  const outerPart = orbit + partRadius;
  const inner = Math.max(5.08, (1 - along) * innerPart + along * Math.max(0, source - 127) - 55.88);
  const outer = (1 - along) * outerPart + along * (source + 127) + 55.88;
  const count = 8;
  const radii: number[] = [];
  const span = Math.max(12.7, outer - inner);
  for (let index = 0; index < count; index++) {
    radii.push(inner + (span * index) / (count - 1));
  }
  return radii;
}

/** Half-angle (deg) for a desired full chord width at sun-radius rho. */
function halfAngleForChordWidth(rho: number, chordWidth: number): number {
  if (!(chordWidth > 0) || !(rho > 0)) return 0;
  const sinArg = Math.min(0.95, chordWidth / (2 * rho));
  return (Math.asin(sinArg) * 180) / Math.PI;
}

/**
 * Pear finger for center-trim: chord width peaks at the part center (orbit) and
 * falls to zero toward both rims. peakWidthMm is the full metal width at center.
 */
function pearSeedAngles(
  knots: number[],
  orbit: number,
  partRadius: number,
  peakWidthMm: number,
): number[] {
  return knots.map((rho) => {
    const u = (rho - orbit) / partRadius;
    if (Math.abs(u) >= 0.98) return 0;
    // Fat at center, taper to the rim — classic pear / teardrop envelope.
    const envelope = Math.pow(Math.max(0, 1 - u * u), 1.7);
    return halfAngleForChordWidth(rho, peakWidthMm * envelope);
  });
}

function halfAngleDegrees(radii: number[], angles: number[], rho: number): number {
  return (
    (maskHalfAngleRadians(
      { offsetIn: 0, sunAngleDeg: 0, radiiIn: radii, halfAngleDeg: angles },
      rho,
    ) *
      180) /
    Math.PI
  );
}

type RayTable = {
  rho: Float64Array;
  phi: Float64Array;
  weight: Float64Array;
  bin: Uint16Array;
  bins: number;
};

function buildRayTable(
  input: CoatingInputs,
  offsetIn: number,
  radii: number[],
  knots: number[],
): RayTable {
  const orbits = orbitsToAverage(input.spinRatio);
  const steps = Math.max(80, Math.min(160, orbits * 100));
  const sunAngleDeg = input.sunAngleDeg ?? 0;
  const beta = (sunAngleDeg * Math.PI) / 180;
  const normalX = Math.sin(beta);
  const normalZ = Math.cos(beta);
  const full = oscillatedTargetEmitters(
    input.sourceOffset,
    input.throwDistance,
    input.targetDiameter ?? 0,
    input.targetTiltDeg ?? 0,
    input.erosionAxis ?? "radial",
    input.targetOscillationDeg ?? 0,
  );
  const stride = 1;
  const emitters = [];
  for (let index = 0; index < full.length; index += stride) {
    const emitter = full[index]!;
    emitters.push({ ...emitter, area: emitter.area * stride });
  }
  const capacity = radii.length * steps * emitters.length;
  const rho = new Float64Array(capacity);
  const phi = new Float64Array(capacity);
  const weight = new Float64Array(capacity);
  const bin = new Uint16Array(capacity);
  let count = 0;
  const sharpness = input.sharpness;
  const sag = input.sag ?? 0;
  const radiusOfCurvature = radiusFromSag(input.partDiameter, sag);
  const plane = offsetIn + opticHighFromSag(sag);
  for (let radiusIndex = 0; radiusIndex < radii.length; radiusIndex++) {
    const radius = radii[radiusIndex] ?? 0;
    for (let step = 0; step < steps; step++) {
      const theta = (Math.PI * 2 * orbits * step) / steps;
      const flat = flatCoatedPose(
        theta,
        radius,
        input.orbitRadius,
        input.spinRatio,
        sunAngleDeg,
      );
      const point = coatedPose(
        theta,
        radius,
        input.orbitRadius,
        input.spinRatio,
        sunAngleDeg,
        input.partDiameter,
        radiusOfCurvature,
      );
      for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
        const emitter = emitters[emitterIndex]!;
        // Angles from the flat planet pose; distance from the curved glass.
        const angleX = emitter.x - flat.x;
        const angleY = emitter.y - flat.y;
        const angleZ = emitter.z - flat.z;
        const angleDistance = Math.sqrt(
          angleX * angleX + angleY * angleY + angleZ * angleZ,
        );
        if (!(angleDistance > 0)) continue;
        const cosLeave =
          (emitter.nx * -angleX + emitter.ny * -angleY + emitter.nz * -angleZ) /
          angleDistance;
        const cosArrive =
          (point.nx * angleX + point.ny * angleY + point.nz * angleZ) / angleDistance;
        if (cosLeave <= 0 || cosArrive <= 0) continue;
        const travelX = emitter.x - point.x;
        const travelY = emitter.y - point.y;
        const travelZ = emitter.z - point.z;
        const distanceSquared = travelX * travelX + travelY * travelY + travelZ * travelZ;
        if (!(distanceSquared > 0)) continue;
        const flux =
          Math.pow(cosLeave, sharpness) * (cosArrive / distanceSquared) * emitter.area;
        if (!(flux > 0)) continue;
        const crossing = normalX * travelX + normalZ * travelZ;
        let hitRho = -1;
        let hitPhi = 0;
        if (Math.abs(crossing) > 1e-12) {
          const along = (plane - (normalX * point.x + normalZ * point.z)) / crossing;
          if (along > 0 && along < 1) {
            const hitX = point.x + along * travelX;
            const hitY = point.y + along * travelY;
            const hitZ = point.z + along * travelZ;
            const planeX = hitX * normalZ - hitZ * normalX;
            hitRho = Math.hypot(planeX, hitY);
            hitPhi = Math.atan2(hitY, planeX);
          }
        }
        rho[count] = hitRho;
        phi[count] = hitPhi;
        weight[count] = flux;
        bin[count] = radiusIndex;
        count += 1;
      }
    }
  }
  return {
    rho: rho.subarray(0, count),
    phi: phi.subarray(0, count),
    weight: weight.subarray(0, count),
    bin: bin.subarray(0, count),
    bins: radii.length,
  };
}

function halfRadians(radii: number[], angles: number[], rho: number): number {
  const count = radii.length;
  const first = radii[0];
  const last = radii[count - 1];
  if (count === 0 || first == null || last == null || rho < first || rho > last) return 0;
  let upper = 1;
  while (upper < count && (radii[upper] ?? 0) < rho) upper += 1;
  if (upper >= count) return 0;
  const lower = upper - 1;
  const left = radii[lower] ?? first;
  const right = radii[upper] ?? left;
  const span = right - left;
  const mix = span > 1e-9 ? (rho - left) / span : 0;
  const degrees = (angles[lower] ?? 0) + mix * ((angles[upper] ?? 0) - (angles[lower] ?? 0));
  return degrees > 0 ? (degrees * Math.PI) / 180 : 0;
}

function scoreAngles(table: RayTable, knots: number[], angles: number[]): ShapeScore {
  const openTotals = new Float64Array(table.bins);
  const totals = new Float64Array(table.bins);
  const rho = table.rho;
  const phi = table.phi;
  const weight = table.weight;
  const bin = table.bin;
  const count = weight.length;
  let open = 0;
  let kept = 0;
  for (let index = 0; index < count; index++) {
    const flux = weight[index] ?? 0;
    const bucket = bin[index] ?? 0;
    open += flux;
    openTotals[bucket] += flux;
    const radius = rho[index] ?? -1;
    if (radius >= 0) {
      const half = halfRadians(knots, angles, radius);
      if (half > 0 && Math.abs(phi[index] ?? 0) < half) continue;
    }
    totals[bucket] += flux;
    kept += flux;
  }
  const last = Math.max(0, table.bins - 1);
  const centerOpen = openTotals[0] ?? 0;
  const edgeOpen = openTotals[last] ?? 0;
  return {
    plusMinusPercent: plusMinusPercent(Array.from(totals)),
    retainedFraction: open > 0 ? kept / open : 1,
    centerRetained: centerOpen > 0 ? (totals[0] ?? 0) / centerOpen : 1,
    edgeRetained: edgeOpen > 0 ? (totals[last] ?? 0) / edgeOpen : 1,
  };
}

type BiasGeom = { orbit: number; partRadius: number };

function seedAngles(
  knots: number[],
  amplitude: number,
  kind: "middle" | "inner" | "outer" | "flat",
  bias: MaskBias = "none",
  geom?: BiasGeom,
): number[] {
  const last = Math.max(1, knots.length - 1);
  return applyBiasOpenSide(
    knots.map((_, index) => {
      const t = index / last;
      const window =
        kind === "flat"
          ? 1
          : kind === "inner"
            ? (1 - t) * (1 - t)
            : kind === "outer"
              ? t * t
              : Math.sin(Math.PI * t) ** 2;
      return amplitude * window;
    }),
    bias,
    knots,
    geom,
  );
}

/** Fraction of part radius from center beyond which open-rim metal must stay zero. */
const PEAR_RIM_OPEN = 0.72;

/** Knots the bias is allowed to put metal on (thin side stays open). */
function activeKnotIndexes(
  count: number,
  bias: MaskBias,
  knots?: number[],
  geom?: BiasGeom,
): number[] {
  if (count <= 0) return [];
  if (bias === "open-rim" && knots && geom) {
    // Only the pear body near the part center may carry metal.
    return knots
      .map((rho, index) =>
        Math.abs(rho - geom.orbit) / geom.partRadius < PEAR_RIM_OPEN ? index : -1,
      )
      .filter((index) => index >= 0);
  }
  if (bias === "open-rim") {
    const last = Math.max(0, count - 4);
    return Array.from({ length: last + 1 }, (_, index) => index);
  }
  if (bias === "open-center") {
    // Leave the inner three knots open on edge-thick (concave) coats.
    const first = Math.min(count - 1, 3);
    return Array.from({ length: count - first }, (_, index) => first + index);
  }
  return Array.from({ length: count }, (_, index) => index);
}

function applyBiasOpenSide(
  angles: number[],
  bias: MaskBias,
  knots?: number[],
  geom?: BiasGeom,
): number[] {
  const next = angles.slice();
  if (bias === "open-rim" && knots && geom && next.length === knots.length) {
    for (let index = 0; index < next.length; index++) {
      const u = Math.abs((knots[index] ?? geom.orbit) - geom.orbit) / geom.partRadius;
      if (u >= PEAR_RIM_OPEN) next[index] = 0;
    }
    return next;
  }
  if (bias === "open-rim" && next.length >= 3) {
    next[next.length - 1] = 0;
    next[next.length - 2] = 0;
    next[next.length - 3] = 0;
  } else if (bias === "open-center" && next.length >= 3) {
    next[0] = 0;
    next[1] = 0;
    next[2] = 0;
  } else if (bias === "open-rim" && next.length >= 2) {
    next[next.length - 1] = 0;
    next[next.length - 2] = 0;
  } else if (bias === "open-center" && next.length >= 2) {
    next[0] = 0;
    next[1] = 0;
  }
  return next;
}

function descend(
  table: RayTable,
  knots: number[],
  start: number[],
  bias: MaskBias,
  geom?: BiasGeom,
): number[] {
  const angles = applyBiasOpenSide(start, bias, knots, geom);
  let best = scoreAngles(table, knots, angles);
  const active = activeKnotIndexes(angles.length, bias, knots, geom);
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const knot of active) {
      let chosen = angles[knot] ?? 0;
      let chosenScore = best;
      for (const step of SEARCH_STEPS) {
        angles[knot] = step;
        const score = scoreAngles(table, knots, angles);
        if (preferMaskScore(score, chosenScore, bias)) {
          chosen = step;
          chosenScore = score;
        }
      }
      angles[knot] = chosen;
      if (preferMaskScore(chosenScore, best, bias)) {
        best = chosenScore;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return applyBiasOpenSide(angles, bias, knots, geom);
}

const MAX_HALF_ANGLE_DEG = 35;

/** Grow a short finger until the ray table meets ±0.5%, if a taller copy can. */
function growAnglesToTarget(
  table: RayTable,
  knots: number[],
  angles: number[],
  bias: MaskBias,
  geom?: BiasGeom,
): number[] {
  let best = angles.slice();
  let bestScore = scoreAngles(table, knots, best);
  if (bestScore.plusMinusPercent <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) {
    return best;
  }
  if (!angles.some((angle) => angle > 0.02)) return best;
  for (const scale of [1.15, 1.3, 1.5, 1.8, 2.2, 2.8, 3.5]) {
    const scaled = applyBiasOpenSide(
      angles.map((angle) => Math.min(MAX_HALF_ANGLE_DEG, angle * scale)),
      bias,
      knots,
      geom,
    );
    const score = scoreAngles(table, knots, scaled);
    if (preferMaskScore(score, bestScore, bias)) {
      best = scaled;
      bestScore = score;
    }
    if (score.plusMinusPercent <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) break;
  }
  return applyBiasOpenSide(best, bias, knots, geom);
}

/** Peel metal off the already-thin side when the ±% still holds. */
function openThinSideKnots(
  table: RayTable,
  knots: number[],
  angles: number[],
  bias: MaskBias,
  geom?: BiasGeom,
): number[] {
  if (bias === "none") return angles;
  const next = angles.slice();
  let bestScore = scoreAngles(table, knots, next);
  const last = next.length - 1;
  const order =
    bias === "open-rim"
      ? Array.from({ length: next.length }, (_, index) => last - index)
      : Array.from({ length: next.length }, (_, index) => index);
  for (const knot of order) {
    if ((next[knot] ?? 0) <= 0.02) continue;
    // Never re-open pear-body peel past the rim-open constraint.
    if (bias === "open-rim" && geom) {
      const u = Math.abs((knots[knot] ?? geom.orbit) - geom.orbit) / geom.partRadius;
      if (u >= PEAR_RIM_OPEN) {
        next[knot] = 0;
        continue;
      }
    }
    const trial = next.slice();
    trial[knot] = 0;
    const score = scoreAngles(table, knots, trial);
    if (preferMaskScore(score, bestScore, bias)) {
      next[knot] = 0;
      bestScore = score;
    }
  }
  return applyBiasOpenSide(next, bias, knots, geom);
}

/**
 * For center-trim pears: rebuild half-angles from a chord envelope that peaks at
 * the spin center, scaled so the peak matches the tallest chord already found.
 * Removes accidental nodal waists at the part center.
 */
function enforcePearChordPeak(
  knots: number[],
  angles: number[],
  geom: BiasGeom,
): number[] {
  if (!angles.some((angle) => angle > 0.02)) return angles;
  let peakWidth = 0;
  for (let index = 0; index < knots.length; index++) {
    const rho = knots[index] ?? 0;
    const half = angles[index] ?? 0;
    const width = 2 * rho * Math.sin((half * Math.PI) / 180);
    if (width > peakWidth) peakWidth = width;
  }
  if (!(peakWidth > 1.27)) return angles;
  return applyBiasOpenSide(
    pearSeedAngles(knots, geom.orbit, geom.partRadius, peakWidth),
    "open-rim",
    knots,
    geom,
  );
}

function bestShape(
  table: RayTable,
  knots: number[],
  bias: MaskBias,
  geom?: BiasGeom,
): number[] {
  let bestAngles = knots.map(() => 0);
  let bestScore = scoreAngles(table, knots, bestAngles);
  const seeds: number[][] = [bestAngles];
  if (bias === "open-rim" && geom) {
    // Pear seeds: fat chord at the part center, open toward both rims.
    for (const peakWidth of [12.7, 22.86, 33.02, 45.72, 60.96, 81.28, 106.68, 139.7]) {
      seeds.push(
        applyBiasOpenSide(
          pearSeedAngles(knots, geom.orbit, geom.partRadius, peakWidth),
          bias,
          knots,
          geom,
        ),
      );
    }
  }
  // Edge-thick (concave): prefer outer/middle fingers that leave the center open.
  // Flat / unknown: try the usual windows.
  const kinds: Array<"middle" | "inner" | "outer" | "flat"> =
    bias === "open-rim"
      ? ["middle", "inner"]
      : bias === "open-center"
        ? ["outer", "middle", "flat", "inner"]
        : ["middle", "inner", "outer", "flat"];
  for (const amplitude of [0.5, 1, 2, 4, 8, 12, 16, 24, 35]) {
    for (const kind of kinds) {
      seeds.push(seedAngles(knots, amplitude, kind, bias, geom));
    }
  }
  let start = bestAngles;
  for (const seed of seeds) {
    const score = scoreAngles(table, knots, seed);
    if (preferMaskScore(score, bestScore, bias)) {
      bestScore = score;
      start = seed;
    }
  }
  const refined = descend(table, knots, start, bias, geom);
  const grown = growAnglesToTarget(table, knots, refined, bias, geom);
  const polished = descend(table, knots, grown, bias, geom);
  const opened = openThinSideKnots(table, knots, polished, bias, geom);
  let finalAngles = descend(table, knots, opened, bias, geom);
  // Convex: always finish as a waist-free pear peaked at the spin center.
  if (bias === "open-rim" && geom) {
    finalAngles = enforcePearChordPeak(knots, finalAngles, geom);
    finalAngles = growAnglesToTarget(table, knots, finalAngles, bias, geom);
    finalAngles = enforcePearChordPeak(knots, finalAngles, geom);
  }
  const finalScore = scoreAngles(table, knots, finalAngles);
  return preferMaskScore(finalScore, bestScore, bias) ? finalAngles : bestAngles;
}

function maskFromShape(
  input: CoatingInputs,
  offsetIn: number,
  radiiIn: number[],
  halfAngleDeg: number[],
): UniformityMask {
  return {
    offsetIn,
    sunAngleDeg: input.sunAngleDeg ?? 0,
    radiiIn,
    halfAngleDeg,
  };
}

function scoreMask(input: CoatingInputs, mask: UniformityMask | null): number {
  const profile = thicknessProfile({
    ...input,
    mask,
    radiusCount: 15,
    samplesPerRadius: 200,
  });
  return profile.planetaryPlusMinusPercent;
}

function profileAtScale(
  input: CoatingInputs,
  offsetIn: number,
  knots: number[],
  angles: number[],
  scale: number,
  bias: MaskBias = "none",
) {
  const geom = bias === "open-rim" ? partOrbit(input) : undefined;
  const scaled = applyBiasOpenSide(
    angles.map((angle) => Math.min(MAX_HALF_ANGLE_DEG, Math.max(0, angle * scale))),
    bias,
    knots,
    geom,
  );
  const mask = maskFromShape(input, offsetIn, knots, scaled);
  const after = thicknessProfile({
    ...input,
    mask,
    radiusCount: 15,
    samplesPerRadius: 200,
  });
  return {
    angles: scaled,
    plusMinusPercent: after.planetaryPlusMinusPercent,
    points: after.points,
  };
}

function shapeFromRetention(
  plusMinusPercent: number,
  retained: ReturnType<typeof retainedFromProfiles>,
): ShapeScore {
  return {
    plusMinusPercent,
    retainedFraction: retained.retainedFraction,
    centerRetained: retained.centerRetained,
    edgeRetained: retained.edgeRetained,
  };
}

/** Nudge the finger on the full average: grow to hit ±0.5%, then open the thin side. */
function refineAnglesOnFullProfile(
  input: CoatingInputs,
  offsetIn: number,
  knots: number[],
  angles: number[],
  beforePoints: RadialSample[],
  bias: MaskBias,
): {
  angles: number[];
  plusMinusPercent: number;
  retainedFraction: number;
  centerRetained: number;
  edgeRetained: number;
} {
  let bestAngles = angles.slice();
  let bestScore: ShapeScore = {
    plusMinusPercent: Number.POSITIVE_INFINITY,
    retainedFraction: 0,
    centerRetained: 0,
    edgeRetained: 0,
  };
  const consider = (scale: number) => {
    const trial = profileAtScale(input, offsetIn, knots, angles, scale, bias);
    const retained = retainedFromProfiles(beforePoints, trial.points);
    const score = shapeFromRetention(trial.plusMinusPercent, retained);
    if (
      preferMaskScore(score, bestScore, bias) ||
      !Number.isFinite(bestScore.plusMinusPercent)
    ) {
      bestAngles = trial.angles;
      bestScore = score;
    }
    return trial.plusMinusPercent;
  };

  const basePm = consider(1);
  if (basePm > MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) {
    for (const scale of [1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5, 3]) {
      const pm = consider(scale);
      if (pm <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) break;
    }
  }
  if (bestScore.plusMinusPercent <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) {
    let low = 0;
    let high = 1;
    const peakOriginal = Math.max(...angles, 0);
    const peakBest = Math.max(...bestAngles, 0);
    if (peakOriginal > 1e-6) {
      high = Math.min(MAX_HALF_ANGLE_DEG / peakOriginal, peakBest / peakOriginal);
    }
    for (let step = 0; step < 10; step++) {
      const mid = (low + high) / 2;
      const trial = profileAtScale(input, offsetIn, knots, angles, mid, bias);
      const retained = retainedFromProfiles(beforePoints, trial.points);
      const score = shapeFromRetention(trial.plusMinusPercent, retained);
      if (trial.plusMinusPercent <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9) {
        if (preferMaskScore(score, bestScore, bias)) {
          bestAngles = trial.angles;
          bestScore = score;
        }
        high = mid;
      } else {
        low = mid;
      }
    }
  }
  // Peel remaining active knots on the full average when that still helps.
  const geom = bias === "open-rim" ? partOrbit(input) : undefined;
  for (const knot of activeKnotIndexes(bestAngles.length, bias, knots, geom).reverse()) {
    if ((bestAngles[knot] ?? 0) <= 0.02) continue;
    const trialAngles = bestAngles.slice();
    trialAngles[knot] = 0;
    const trial = profileAtScale(input, offsetIn, knots, trialAngles, 1, bias);
    const retained = retainedFromProfiles(beforePoints, trial.points);
    const score = shapeFromRetention(trial.plusMinusPercent, retained);
    if (preferMaskScore(score, bestScore, bias)) {
      bestAngles = trial.angles;
      bestScore = score;
    }
  }
  if (bias === "open-rim" && geom) {
    const pearAngles = enforcePearChordPeak(knots, bestAngles, geom);
    const pearTrial = profileAtScale(input, offsetIn, knots, pearAngles, 1, bias);
    const pearRetained = retainedFromProfiles(beforePoints, pearTrial.points);
    const pearScore = shapeFromRetention(pearTrial.plusMinusPercent, pearRetained);
    // Always keep the waist-free pear for convex; re-score its film.
    bestAngles = pearTrial.angles;
    bestScore = pearScore;
  }
  return {
    angles: applyBiasOpenSide(bestAngles, bias, knots, geom),
    plusMinusPercent: bestScore.plusMinusPercent,
    retainedFraction: bestScore.retainedFraction,
    centerRetained: bestScore.centerRetained,
    edgeRetained: bestScore.edgeRetained,
  };
}

/** Best finger at one gap. Meet ±0.5% if possible, then trim the thick place. */
export function optimizeMaskAtOffset(
  input: CoatingInputs,
  offsetIn: number,
  openScore?: number,
  bias: MaskBias = "none",
): MaskGapScore {
  const geom = bias === "open-rim" ? partOrbit(input) : undefined;
  let knots = knotRadii(input, offsetIn, bias);
  let table = buildRayTable(input, offsetIn, partRadii(input.partDiameter, 9), knots);
  let angles = bestShape(table, knots, bias, geom);
  // Concave / unbiased: if the peak sits on an end knot, widen the span and retry.
  // Convex pear stays on the part footprint — do not stretch past the rim.
  if (bias !== "open-rim") {
    const peak = angles.reduce(
      (best, angle, index) => (angle > (angles[best] ?? 0) ? index : best),
      0,
    );
    const peakedAtEnd =
      (angles[peak] ?? 0) > 0.05 && (peak === 0 || peak === angles.length - 1);
    if (peakedAtEnd) {
      const widened = knots.slice();
      if (peak === 0) widened[0] = Math.max(5.08, (widened[0] ?? 5.08) - 50.8);
      else widened[widened.length - 1] = (widened[widened.length - 1] ?? 0) + 50.8;
      knots = widened;
      table = buildRayTable(input, offsetIn, partRadii(input.partDiameter, 9), knots);
      angles = bestShape(table, knots, bias, geom);
    }
  }
  const open = openScore ?? scoreMask(input, null);
  const blocked = angles.some((angle) => angle > 0.02);
  if (!blocked) {
    return {
      offsetIn,
      plusMinusPercent: open,
      retainedFraction: 1,
      centerRetained: 1,
      edgeRetained: 1,
      radiiIn: knots,
      halfAngleDeg: knots.map(() => 0),
    };
  }
  const before = thicknessProfile({
    ...input,
    mask: null,
    radiusCount: 15,
    samplesPerRadius: 200,
  });
  const refined = refineAnglesOnFullProfile(
    input,
    offsetIn,
    knots,
    angles,
    before.points,
    bias,
  );
  if (
    !preferMaskScore(
      {
        plusMinusPercent: refined.plusMinusPercent,
        retainedFraction: refined.retainedFraction,
        centerRetained: refined.centerRetained,
        edgeRetained: refined.edgeRetained,
      },
      {
        plusMinusPercent: open,
        retainedFraction: 1,
        centerRetained: 1,
        edgeRetained: 1,
      },
      bias,
    )
  ) {
    return {
      offsetIn,
      plusMinusPercent: open,
      retainedFraction: 1,
      centerRetained: 1,
      edgeRetained: 1,
      radiiIn: knots,
      halfAngleDeg: knots.map(() => 0),
    };
  }
  return {
    offsetIn,
    plusMinusPercent: refined.plusMinusPercent,
    retainedFraction: refined.retainedFraction,
    centerRetained: refined.centerRetained,
    edgeRetained: refined.edgeRetained,
    radiiIn: knots,
    halfAngleDeg: refined.angles.map((angle) => Number(angle.toFixed(2))),
  };
}

export function describeMaskShape(mask: UniformityMask, bias: MaskBias = "none"): string {
  const angles = mask.halfAngleDeg;
  const radii = mask.radiiIn;
  let widest = 0;
  let widestChord = -1;
  for (let index = 0; index < angles.length; index++) {
    const rho = radii[index] ?? 0;
    const chord = maskChordWidthAt(mask, rho);
    if (chord > widestChord) {
      widestChord = chord;
      widest = index;
    }
  }
  const reach = angles[widest] ?? 0;
  if (!(reach > 0.05) && !(widestChord > 1.27)) {
    return "The plate stays open. No metal crosses the sputter, so the coat matches the unmasked film.";
  }
  const radius = radii[widest] ?? 0;
  const inner = radii[0] ?? 0;
  const outer = radii[radii.length - 1] ?? 0;
  const width = Math.max(widestChord, 2 * radius * Math.sin((reach * Math.PI) / 180));
  const job =
    bias === "open-rim"
      ? " It is pear-shaped for a center-thick coat: the metal is widest near the part center and tapers toward both rims so the center loses more coat than the edge."
      : bias === "open-center"
        ? " The wide metal is the rim-trim path: it blocks more sputter aimed at the thick rim than at the thinner center, and the inner knots stay open."
        : "";
  return `The metal is a finger along the line from the sun toward the target. The widest part is ${radius.toFixed(1)} mm from the sun center and about ${width.toFixed(1)} mm across. It tapers off between ${inner.toFixed(1)} and ${outer.toFixed(1)} mm from the sun center.${job}`;
}

/** Full metal chord width (mm) at sun-radius rho. Used to check pear shape. */
export function maskChordWidthAt(
  mask: UniformityMask,
  rho: number,
): number {
  const halfDeg = halfAngleDegrees(mask.radiiIn, mask.halfAngleDeg, rho);
  if (!(halfDeg > 0) || !(rho > 0)) return 0;
  return 2 * rho * Math.sin((halfDeg * Math.PI) / 180);
}

export function assembleMaskDesign(
  input: CoatingInputs,
  gaps: MaskGapScore[],
  placement: MaskPlacement = "substrate",
): MaskDesign {
  const before = thicknessProfile({ ...input, mask: null });
  const bias = maskBiasFromProfile(before.points);
  // The search ranks shapes on a coarser average. Close gaps can swap places
  // there, so each shape is scored again on the full radial average before
  // the plate is chosen. The gap list the page shows is that full average.
  const confirmed = gaps.map((gap) => {
    const blocked = gap.halfAngleDeg.some((angle) => angle > 0.02);
    if (!blocked) {
      return {
        ...gap,
        plusMinusPercent: before.planetaryPlusMinusPercent,
        retainedFraction: 1,
        centerRetained: 1,
        edgeRetained: 1,
      };
    }
    const profile = thicknessProfile({
      ...input,
      mask: maskFromShape(input, gap.offsetIn, gap.radiiIn, gap.halfAngleDeg),
    });
    const retained = retainedFromProfiles(before.points, profile.points);
    return {
      ...gap,
      plusMinusPercent: profile.planetaryPlusMinusPercent,
      ...retained,
    };
  });
  const finite = confirmed.filter(
    (gap) =>
      Number.isFinite(gap.plusMinusPercent) && Number.isFinite(gap.retainedFraction),
  );
  const winner = finite.reduce<MaskGapScore | undefined>(
    (best, gap) => (!best || preferMaskScore(gap, best, bias) ? gap : best),
    undefined,
  );
  const high = opticHighFromSag(input.sag ?? 0);
  const offsetIn =
    winner?.offsetIn ??
    maskSearchGaps(input.throwDistance, placement, Number.isFinite(high) ? high : 0)[0] ??
    2.54;
  const radiiIn = winner?.radiiIn ?? [];
  const halfAngleDeg = winner?.halfAngleDeg ?? [];
  let mask = maskFromShape(input, offsetIn, radiiIn, halfAngleDeg);
  let after = thicknessProfile({ ...input, mask });
  let retained = retainedFromProfiles(before.points, after.points);
  let improved = preferMaskScore(
    shapeFromRetention(after.planetaryPlusMinusPercent, retained),
    {
      plusMinusPercent: before.planetaryPlusMinusPercent,
      retainedFraction: 1,
      centerRetained: 1,
      edgeRetained: 1,
    },
    bias,
  );
  if (!improved) {
    mask = maskFromShape(
      input,
      offsetIn,
      radiiIn,
      radiiIn.map(() => 0),
    );
    after = before;
    retained = { retainedFraction: 1, centerRetained: 1, edgeRetained: 1 };
  }
  return {
    offsetIn,
    mask,
    beforePlusMinusPercent: before.planetaryPlusMinusPercent,
    afterPlusMinusPercent: after.planetaryPlusMinusPercent,
    retainedFraction: retained.retainedFraction,
    centerRetained: retained.centerRetained,
    edgeRetained: retained.edgeRetained,
    beforePoints: before.points,
    afterPoints: after.points,
    gaps: confirmed,
    placement,
    improved,
    meetsTarget:
      improved &&
      after.planetaryPlusMinusPercent <= MASK_UNIFORMITY_TARGET_PERCENT + 1e-9,
    bias,
    shapeText: describeMaskShape(mask, bias),
  };
}

export type MaskSearchState = {
  openScore: number;
  gaps: MaskGapScore[];
  queue: number[];
  refined: boolean;
  placement: MaskPlacement;
  bias: MaskBias;
  minGap: number;
  maxGap: number;
};

export function startMaskSearch(
  input: CoatingInputs,
  placement: MaskPlacement = "substrate",
): MaskSearchState {
  const high = opticHighFromSag(input.sag ?? 0);
  const limits = maskGapLimits(input.throwDistance, placement, Number.isFinite(high) ? high : 0);
  const openProfile = thicknessProfile({
    ...input,
    mask: null,
    radiusCount: 15,
    samplesPerRadius: 200,
  });
  return {
    openScore: openProfile.planetaryPlusMinusPercent,
    gaps: [],
    queue: maskSearchGaps(input.throwDistance, placement, Number.isFinite(high) ? high : 0),
    refined: false,
    placement,
    bias: maskBiasFromProfile(openProfile.points),
    minGap: limits.min,
    maxGap: limits.max,
  };
}

/** Does one gap, then schedules the gaps beside the best one. */
export function advanceMaskSearch(
  input: CoatingInputs,
  state: MaskSearchState,
): MaskSearchState {
  const queue = state.queue.slice();
  const next = queue.shift();
  if (next != null) {
    return {
      ...state,
      queue,
      gaps: [
        ...state.gaps,
        optimizeMaskAtOffset(input, next, state.openScore, state.bias),
      ],
    };
  }
  if (!state.refined && state.gaps.length > 0) {
    const best = state.gaps.reduce((winner, gap) =>
      preferMaskScore(gap, winner, state.bias) ? gap : winner,
    );
    const extra = [best.offsetIn - 7.62, best.offsetIn + 7.62]
      .map((offset) => Number(offset.toFixed(2)))
      .filter(
        (offset) =>
          offset >= state.minGap - 1e-6 &&
          offset <= state.maxGap + 1e-6 &&
          !state.gaps.some((gap) => Math.abs(gap.offsetIn - offset) < 2.03),
      );
    return { ...state, queue: extra, refined: true };
  }
  return { ...state, queue, refined: true };
}

export function maskSearchDone(state: MaskSearchState): boolean {
  return state.refined && state.queue.length === 0;
}

export function designUniformityMask(
  input: CoatingInputs,
  placement: MaskPlacement = "substrate",
): MaskDesign {
  let state = startMaskSearch(input, placement);
  while (!maskSearchDone(state)) {
    state = advanceMaskSearch(input, state);
  }
  const gaps = state.gaps.slice().sort((left, right) => left.offsetIn - right.offsetIn);
  return assembleMaskDesign(input, gaps, placement);
}

/**
 * Closed outline of the metal for drawing / CSV.
 * x is sun-radius along the sun→target line; ±y is half the metal chord at that
 * sun-radius. That keeps a center-trim pear visually fat at the spin center.
 * (A polar (ρ,±φ) polyline bows the wide chord sunward and can falsely pinch
 * at the part center even when the chord there is large.)
 */
export function maskOutlinePoints(mask: UniformityMask, samples = 41): Array<{ x: number; y: number }> {
  const radii = mask.radiiIn;
  const angles = mask.halfAngleDeg;
  if (radii.length < 2 || !angles.some((angle) => angle > 0.05)) return [];
  const count = Math.max(8, samples);
  const upper: Array<{ x: number; y: number }> = [];
  const lower: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index++) {
    const rho = radii[0]! + ((radii[radii.length - 1]! - radii[0]!) * index) / (count - 1);
    const halfWidth = 0.5 * maskChordWidthAt(mask, rho);
    upper.push({ x: rho, y: halfWidth });
    lower.push({ x: rho, y: -halfWidth });
  }
  return [...upper, ...lower.reverse()];
}

export function maskOutlineCsv(design: MaskDesign, input: CoatingInputs): string {
  const sag = input.sag ?? 0;
  const lines = [
    `offset_mm,${design.offsetIn.toFixed(2)}`,
    `mask_place,near_part`,
    `throw_mm,${input.throwDistance.toFixed(2)}`,
    `target_distance_mm,${input.sourceOffset.toFixed(2)}`,
    `gearing,${input.spinRatio.toFixed(3)}`,
    `sun_angle_deg,${(input.sunAngleDeg ?? 0).toFixed(3)}`,
    `target_oscillation_deg,${(input.targetOscillationDeg ?? 0).toFixed(3)}`,
    `part_diameter_mm,${input.partDiameter.toFixed(2)}`,
    `sag_mm,${Number.isFinite(sag) ? sag.toFixed(2) : ""}`,
    `orbit_radius_mm,${input.orbitRadius.toFixed(2)}`,
    "x_mm,y_mm",
  ];
  for (const point of maskOutlinePoints(design.mask, 49)) {
    lines.push(`${point.x.toFixed(4)},${point.y.toFixed(4)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Used by the page to confirm a ray is blocked. Re-exported through the design. */
export { maskBlocksRay };
