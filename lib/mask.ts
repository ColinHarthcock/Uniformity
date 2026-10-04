import {
  coatedPose,
  maskBlocksRay,
  opticSag,
  radiusFromFocalLength,
  maskHalfAngleRadians,
  opticHigh,
  orbitsToAverage,
  oscillatedTargetEmitters,
  plusMinusPercent,
  thicknessProfile,
  type CoatingInputs,
  type RadialSample,
  type UniformityMask,
} from "./coating";

/** Where the search is allowed to put the plate. */
export type MaskPlacement = "substrate" | "target";

/** How far from the glass, or from the target, still counts as "near". */
const MASK_NEAR_IN = 4;

export function maskGapLimits(
  throwDistance: number,
  placement: MaskPlacement = "substrate",
  opticHighIn = 0,
): { min: number; max: number } {
  const high = Number.isFinite(opticHighIn) ? Math.max(0, opticHighIn) : 0;
  const room = throwDistance - 0.15 - high;
  if (placement === "target") {
    const min = Math.max(0.1, throwDistance - MASK_NEAR_IN - high);
    return { min: Math.min(min, room), max: room };
  }
  return { min: 0.1, max: Math.min(MASK_NEAR_IN, room) };
}

/**
 * Gaps to try, in inches of clearance from the glass nearest the target.
 * Near the part stays within 4 inches of that glass. Near the target stays
 * within 4 inches of the target. A raised center shortens the room above it.
 */
export function maskSearchGaps(
  throwDistance: number,
  placement: MaskPlacement = "substrate",
  opticHighIn = 0,
): number[] {
  const { min, max } = maskGapLimits(throwDistance, placement, opticHighIn);
  if (!(max > min + 0.04)) return [];
  const acrossTheBand = [0.04, 0.22, 0.4, 0.58, 0.74, 0.88, 0.96].map(
    (fraction) => min + (max - min) * fraction,
  );
  const alongTheThrow = [0.7, 0.85, 0.93, 0.97, 0.975, 0.985].map(
    (fraction) => throwDistance * fraction,
  );
  const seeds =
    placement === "substrate"
      ? [0.1, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
      : [...acrossTheBand, ...alongTheThrow];
  const gaps = seeds
    .filter((gap) => gap >= min - 1e-6 && gap <= max + 1e-6)
    .map((gap) => Number(Math.min(gap, max).toFixed(2)))
    .filter((gap) => gap > 0.05 && gap <= max + 1e-6);
  return [...new Set(gaps)].sort((left, right) => left - right);
}

export type MaskGapScore = {
  offsetIn: number;
  plusMinusPercent: number;
  radiiIn: number[];
  halfAngleDeg: number[];
};

export type MaskDesign = {
  offsetIn: number;
  mask: UniformityMask;
  beforePlusMinusPercent: number;
  afterPlusMinusPercent: number;
  beforePoints: RadialSample[];
  afterPoints: RadialSample[];
  gaps: MaskGapScore[];
  /** Which end of the gap the search was allowed to use. */
  placement: MaskPlacement;
  /** True when the mask beats the unmasked film on the full average. */
  improved: boolean;
  shapeText: string;
};

const SEARCH_STEPS = [0, 0.05, 0.1, 0.15, 0.25, 0.4, 0.7, 1.2, 2, 4, 8, 15];

function partRadii(partDiameter: number, count: number): number[] {
  const outer = Math.max(0, partDiameter) / 2;
  const radii: number[] = [];
  const safe = Math.max(2, count);
  for (let index = 0; index < safe; index++) {
    radii.push((outer * index) / (safe - 1));
  }
  return radii;
}

function knotRadii(input: CoatingInputs, offsetIn: number): number[] {
  const orbit = Math.abs(input.orbitRadius);
  const partRadius = Math.max(0, input.partDiameter) / 2;
  const throwDistance = input.throwDistance;
  const along = throwDistance > 0 ? offsetIn / throwDistance : 0;
  const source = Math.abs(input.sourceOffset);
  const innerPart = Math.max(0, orbit - partRadius);
  const outerPart = orbit + partRadius;
  const inner = Math.max(0.2, (1 - along) * innerPart + along * Math.max(0, source - 5) - 2.2);
  const outer = (1 - along) * outerPart + along * (source + 5) + 2.2;
  const count = 8;
  const radii: number[] = [];
  const span = Math.max(0.5, outer - inner);
  for (let index = 0; index < count; index++) {
    radii.push(inner + (span * index) / (count - 1));
  }
  return radii;
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
  const radiusOfCurvature = radiusFromFocalLength(input.focalLength ?? 0);
  const plane = offsetIn + opticHigh(input.partDiameter, radiusOfCurvature);
  for (let radiusIndex = 0; radiusIndex < radii.length; radiusIndex++) {
    const radius = radii[radiusIndex] ?? 0;
    for (let step = 0; step < steps; step++) {
      const theta = (Math.PI * 2 * orbits * step) / steps;
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
        const travelX = emitter.x - point.x;
        const travelY = emitter.y - point.y;
        const travelZ = emitter.z - point.z;
        const distanceSquared = travelX * travelX + travelY * travelY + travelZ * travelZ;
        const distance = Math.sqrt(distanceSquared);
        if (!(distance > 0)) continue;
        const cosLeave =
          (emitter.nx * -travelX + emitter.ny * -travelY + emitter.nz * -travelZ) / distance;
        const cosArrive =
          (point.nx * travelX + point.ny * travelY + point.nz * travelZ) / distance;
        if (cosLeave <= 0 || cosArrive <= 0) continue;
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

function scoreAngles(table: RayTable, knots: number[], angles: number[]): number {
  const totals = new Float64Array(table.bins);
  const rho = table.rho;
  const phi = table.phi;
  const weight = table.weight;
  const bin = table.bin;
  const count = weight.length;
  for (let index = 0; index < count; index++) {
    const radius = rho[index] ?? -1;
    if (radius >= 0) {
      const half = halfRadians(knots, angles, radius);
      if (half > 0 && Math.abs(phi[index] ?? 0) < half) continue;
    }
    totals[bin[index] ?? 0] += weight[index] ?? 0;
  }
  return plusMinusPercent(Array.from(totals));
}

function seedAngles(knots: number[], amplitude: number, kind: "middle" | "inner" | "outer" | "flat"): number[] {
  const last = Math.max(1, knots.length - 1);
  return knots.map((_, index) => {
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
  });
}

function descend(table: RayTable, knots: number[], start: number[]): number[] {
  const angles = start.slice();
  let best = scoreAngles(table, knots, angles);
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let knot = 0; knot < angles.length; knot++) {
      let chosen = angles[knot] ?? 0;
      let chosenScore = best;
      for (const step of SEARCH_STEPS) {
        angles[knot] = step;
        const score = scoreAngles(table, knots, angles);
        const tighter = Math.abs(score - chosenScore) <= 1e-5 && step < chosen;
        if (score < chosenScore - 1e-5 || tighter) {
          chosen = step;
          chosenScore = score;
        }
      }
      angles[knot] = chosen;
      if (chosenScore < best - 1e-5) {
        best = chosenScore;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return angles;
}

function bestShape(table: RayTable, knots: number[]): number[] {
  let bestAngles = knots.map(() => 0);
  let bestScore = scoreAngles(table, knots, bestAngles);
  const seeds: number[][] = [bestAngles];
  for (const amplitude of [1, 3, 8, 16, 30]) {
    seeds.push(seedAngles(knots, amplitude, "middle"));
    seeds.push(seedAngles(knots, amplitude, "inner"));
    seeds.push(seedAngles(knots, amplitude, "outer"));
  }
  let start = bestAngles;
  for (const seed of seeds) {
    const score = scoreAngles(table, knots, seed);
    if (score < bestScore - 1e-5) {
      bestScore = score;
      start = seed;
    }
  }
  const refined = descend(table, knots, start);
  const refinedScore = scoreAngles(table, knots, refined);
  return refinedScore <= bestScore + 1e-5 ? refined : bestAngles;
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

/** Best finger at one gap. The ±% is the real spot, on a moderate radial average. */
export function optimizeMaskAtOffset(
  input: CoatingInputs,
  offsetIn: number,
  openScore?: number,
): MaskGapScore {
  let knots = knotRadii(input, offsetIn);
  let table = buildRayTable(input, offsetIn, partRadii(input.partDiameter, 7), knots);
  let angles = bestShape(table, knots);
  const peak = angles.reduce((best, angle, index) => (angle > (angles[best] ?? 0) ? index : best), 0);
  const peakedAtEnd = (angles[peak] ?? 0) > 0.05 && (peak === 0 || peak === angles.length - 1);
  if (peakedAtEnd) {
    const widened = knots.slice();
    if (peak === 0) widened[0] = Math.max(0.2, (widened[0] ?? 0.2) - 2);
    else widened[widened.length - 1] = (widened[widened.length - 1] ?? 0) + 2;
    knots = widened;
    table = buildRayTable(input, offsetIn, partRadii(input.partDiameter, 7), knots);
    angles = bestShape(table, knots);
  }
  const open = openScore ?? scoreMask(input, null);
  const mask = maskFromShape(input, offsetIn, knots, angles);
  const shaped = angles.some((angle) => angle > 0.02) ? scoreMask(input, mask) : open;
  if (!(shaped < open - 1e-4)) {
    return {
      offsetIn,
      plusMinusPercent: open,
      radiiIn: knots,
      halfAngleDeg: knots.map(() => 0),
    };
  }
  return {
    offsetIn,
    plusMinusPercent: shaped,
    radiiIn: knots,
    halfAngleDeg: angles.map((angle) => Number(angle.toFixed(2))),
  };
}

export function describeMaskShape(mask: UniformityMask): string {
  const angles = mask.halfAngleDeg;
  const radii = mask.radiiIn;
  let widest = 0;
  for (let index = 1; index < angles.length; index++) {
    if ((angles[index] ?? 0) > (angles[widest] ?? 0)) widest = index;
  }
  const reach = angles[widest] ?? 0;
  if (!(reach > 0.05)) {
    return "The plate stays open. No metal crosses the sputter, so the coat matches the unmasked film.";
  }
  const radius = radii[widest] ?? 0;
  const inner = radii[0] ?? 0;
  const outer = radii[radii.length - 1] ?? 0;
  const width = 2 * radius * Math.sin((reach * Math.PI) / 180);
  return `The metal is a finger along the line from the sun toward the target. The widest part is ${radius.toFixed(1)} in from the sun center and about ${width.toFixed(2)} in across. It tapers off between ${inner.toFixed(1)} and ${outer.toFixed(1)} in from the sun center.`;
}

export function assembleMaskDesign(
  input: CoatingInputs,
  gaps: MaskGapScore[],
  placement: MaskPlacement = "substrate",
): MaskDesign {
  const before = thicknessProfile({ ...input, mask: null });
  // The search ranks shapes on a coarser average. Close gaps can swap places
  // there, so each shape is scored again on the full radial average before
  // the plate is chosen. The gap list the page shows is that full average.
  const confirmed = gaps.map((gap) => {
    const blocked = gap.halfAngleDeg.some((angle) => angle > 0.02);
    if (!blocked) return { ...gap, plusMinusPercent: before.planetaryPlusMinusPercent };
    const profile = thicknessProfile({
      ...input,
      mask: maskFromShape(input, gap.offsetIn, gap.radiiIn, gap.halfAngleDeg),
    });
    return { ...gap, plusMinusPercent: profile.planetaryPlusMinusPercent };
  });
  const finite = confirmed.filter((gap) => Number.isFinite(gap.plusMinusPercent));
  const winner = finite.reduce<MaskGapScore | undefined>(
    (best, gap) => (!best || gap.plusMinusPercent < best.plusMinusPercent ? gap : best),
    undefined,
  );
  const high = opticHigh(input.partDiameter, radiusFromFocalLength(input.focalLength ?? 0));
  const offsetIn =
    winner?.offsetIn ??
    maskSearchGaps(input.throwDistance, placement, Number.isFinite(high) ? high : 0)[0] ??
    0.1;
  const radiiIn = winner?.radiiIn ?? [];
  const halfAngleDeg = winner?.halfAngleDeg ?? [];
  let mask = maskFromShape(input, offsetIn, radiiIn, halfAngleDeg);
  let after = thicknessProfile({ ...input, mask });
  let improved =
    Number.isFinite(after.planetaryPlusMinusPercent) &&
    after.planetaryPlusMinusPercent < before.planetaryPlusMinusPercent - 1e-4;
  if (!improved) {
    mask = maskFromShape(
      input,
      offsetIn,
      radiiIn,
      radiiIn.map(() => 0),
    );
    after = before;
  }
  return {
    offsetIn,
    mask,
    beforePlusMinusPercent: before.planetaryPlusMinusPercent,
    afterPlusMinusPercent: after.planetaryPlusMinusPercent,
    beforePoints: before.points,
    afterPoints: after.points,
    gaps: confirmed,
    placement,
    improved,
    shapeText: describeMaskShape(mask),
  };
}

export type MaskSearchState = {
  openScore: number;
  gaps: MaskGapScore[];
  queue: number[];
  refined: boolean;
  placement: MaskPlacement;
  minGap: number;
  maxGap: number;
};

export function startMaskSearch(
  input: CoatingInputs,
  placement: MaskPlacement = "substrate",
): MaskSearchState {
  const high = opticHigh(input.partDiameter, radiusFromFocalLength(input.focalLength ?? 0));
  const limits = maskGapLimits(input.throwDistance, placement, Number.isFinite(high) ? high : 0);
  return {
    openScore: scoreMask(input, null),
    gaps: [],
    queue: maskSearchGaps(input.throwDistance, placement, Number.isFinite(high) ? high : 0),
    refined: false,
    placement,
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
      gaps: [...state.gaps, optimizeMaskAtOffset(input, next, state.openScore)],
    };
  }
  if (!state.refined && state.gaps.length > 0) {
    const best = state.gaps.reduce((winner, gap) =>
      gap.plusMinusPercent < winner.plusMinusPercent ? gap : winner,
    );
    const extra = [best.offsetIn - 0.3, best.offsetIn + 0.3]
      .map((offset) => Number(offset.toFixed(2)))
      .filter(
        (offset) =>
          offset >= state.minGap - 1e-6 &&
          offset <= state.maxGap + 1e-6 &&
          !state.gaps.some((gap) => Math.abs(gap.offsetIn - offset) < 0.08),
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

/** Closed outline of the metal, in inches, in the mask plane. Origin is the sun center; +x points at the target. */
export function maskOutlinePoints(mask: UniformityMask, samples = 41): Array<{ x: number; y: number }> {
  const radii = mask.radiiIn;
  const angles = mask.halfAngleDeg;
  if (radii.length < 2 || !angles.some((angle) => angle > 0.05)) return [];
  const count = Math.max(8, samples);
  const upper: Array<{ x: number; y: number }> = [];
  const lower: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index++) {
    const rho = radii[0]! + ((radii[radii.length - 1]! - radii[0]!) * index) / (count - 1);
    const half = (halfAngleDegrees(radii, angles, rho) * Math.PI) / 180;
    upper.push({ x: rho * Math.cos(half), y: rho * Math.sin(half) });
    lower.push({ x: rho * Math.cos(half), y: -rho * Math.sin(half) });
  }
  return [...upper, ...lower.reverse()];
}

export function maskOutlineCsv(design: MaskDesign, input: CoatingInputs): string {
  const sag = opticSag(input.partDiameter, radiusFromFocalLength(input.focalLength ?? 0));
  const lines = [
    `offset_in,${design.offsetIn.toFixed(3)}`,
    `mask_place,${design.placement === "target" ? "near_target" : "near_part"}`,
    `throw_in,${input.throwDistance.toFixed(3)}`,
    `target_distance_in,${input.sourceOffset.toFixed(3)}`,
    `gearing,${input.spinRatio.toFixed(3)}`,
    `sun_angle_deg,${(input.sunAngleDeg ?? 0).toFixed(3)}`,
    `target_oscillation_deg,${(input.targetOscillationDeg ?? 0).toFixed(3)}`,
    `part_diameter_in,${input.partDiameter.toFixed(3)}`,
    `focal_length_in,${(input.focalLength ?? 0).toFixed(3)}`,
    `sag_in,${Number.isFinite(sag) ? sag.toFixed(3) : ""}`,
    `orbit_radius_in,${input.orbitRadius.toFixed(3)}`,
    "x_in,y_in",
  ];
  for (const point of maskOutlinePoints(design.mask, 49)) {
    lines.push(`${point.x.toFixed(4)},${point.y.toFixed(4)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Used by the page to confirm a ray is blocked. Re-exported through the design. */
export { maskBlocksRay };
