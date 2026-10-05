/**
 * Thickness of a coating on an optic in a planetary rotation system.
 *
 * The optic is centered on the planet. Its rim lies on the sun, in z = 0,
 * facing up, until the sun is tilted. The optic control is signed sag.
 * Zero is flat. Positive is a convex face toward the target (center closer
 * than the rim — thicker coat at the center). Negative is concave toward
 * the target (center farther — thicker coat at the edge). The sphere
 * radius follows from the sag and the optic diameter. Closer to the target
 * means thicker coating.
 * The planets are attached to the sun,
 * so the sun angle is their angle to the sputtered plume. There is no
 * second, local tilt. Zero leaves the planets level, faces up. Positive
 * drops the side of the sun under the target. The fixture limit on that
 * angle is ±10°. The target hangs above. Throw distance H is the height of
 * the target center above the rim plane. The target center is at
 * (offset, 0, H).
 *
 * Ion-beam leave law follows VacCoat’s IBS sketch: the ion arrow and the
 * coat arrow are roughly mirror images about the plate normal. With a 45°
 * ion beam the preferred leave axis is about 45° from the normal, on the
 * side opposite the gun — not along the normal. The default plate aim is
 * −45° (normal tipped toward the outboard gun) so that specular leave
 * points straight down onto the sun plane. The gun sits outboard at the
 * target height and shoots inward; the flux meets the face at 45°. Each
 * patch emits a cosine about that preferred leave axis (plume sharpness),
 * weighted by how many ions hit it. Cosine-about-normal is not the IBS
 * leave law.
 *
 * For ion-beam sputtering the 16 cm size is the ion beam, not the sputtered
 * spot. The beam is flat through most of its radius and falls off at the
 * edge. The footprint is an ellipse. The long axis is the beam diameter
 * divided by cos(45°) and points along the sun radius. A beam diameter of
 * 0 is a point source (electron-beam pocket) and keeps leave along the
 * plate normal.
 *
 * The target also rocks ±3° about that plate aim, in the same plane as the
 * target tilt. The gun stays fixed, so the ion angle swings with the face.
 * Thickness is the equal-time average over that swing.
 *
 * The planet keeps orbiting the whole time. Sun angle is the tilt of the
 * whole sun, and of the planets fixed to it.
 *
 * A point on the planet at orbit angle θ is
 *   planet center + (r cos ψ, r sin ψ, 0)
 * with ψ = −θ × spins per orbit, so the planet spins opposite its orbit.
 *
 * Each emitter contributes (cos α)^n × (cos β) / d^2 × area.
 * cos α is the angle off the preferred leave axis (how the atom leaves).
 * cos β is the angle off the part normal (how it arrives).
 * Either cosine at or below 0 contributes nothing.
 *
 * A uniformity mask is a stationary plate between the part and the target,
 * parallel to the coated face. It is open or blocked. A ray that crosses
 * the plate inside the metal does not deposit. The elliptical spot is kept,
 * so a point on the part can see only part of the spot (a penumbra).
 */

export const RADIUS_COUNT = 41;
const MAX_ORBITS = 24;
const CLOSURE_TOLERANCE = 1e-4;
const BEAM_RINGS = 8;
const BEAM_ANGLES = 12;

/** Millimeters per inch — lengths in this module are millimeters. */
export const MM_PER_IN = 25.4;

/** 160 mm (16 cm) ion-beam diameter, the published source size. */
export const IBS_SOURCE_DIAMETER_MM = 160;

/** @deprecated Use IBS_SOURCE_DIAMETER_MM. */
export const IBS_SOURCE_DIAMETER_IN = IBS_SOURCE_DIAMETER_MM;

/**
 * Ion beam vs the plate normal, in degrees. At the default IBS aim the gun
 * sits outboard at target height and the flux meets the face at 45°.
 */
export const ION_INCIDENCE_DEG = 45;

/**
 * Default IBS plate aim, in degrees from face-down. Negative tips the
 * normal toward the outboard gun so the specular leave axis (45° from the
 * normal, opposite the ion) points straight down onto the parts — the
 * VacCoat IBS layout.
 */
export const IBS_AIM_TILT_DEG = -ION_INCIDENCE_DEG;

/** Fixture limit on the sun angle, the planets' angle to the plume. */
export const PLANET_AOI_LIMIT_DEG = 10;

/**
 * How far the target face rocks either side of its aim, in degrees.
 * Colin’s fixture swings ±3° angle of incidence. Not a number from a
 * Spector drawing found for this work.
 */
export const TARGET_OSCILLATION_DEG = 3;

/**
 * Stand-in beam shape. No Spector drawing gives the flat fraction.
 * Full current inside this fraction of the beam radius, then a cosine drop
 * to zero at the edge. Not a measured curve.
 */
export const BEAM_FLAT_FRACTION = 0.75;

export type ErosionAxis = "radial" | "tangential";

export const METHOD_SHARPNESS = {
  ibs: 2,
  ebeam: 2,
} as const;

export const METHOD_TARGET_DIAMETER = {
  ibs: IBS_SOURCE_DIAMETER_MM,
  ebeam: 0,
} as const;

export type CoatingMethod = keyof typeof METHOD_SHARPNESS;

/** Default chamber geometry. All lengths are millimeters. */
export const DEFAULT_COATING = {
  method: "ibs" as CoatingMethod,
  throwDistance: 304.8,
  sharpness: METHOD_SHARPNESS.ibs,
  partDiameter: 203.2,
  planetDiameter: 203.2,
  sunDiameter: 508,
  orbitRadius: 152.4,
  spinRatio: 20,
  sourceOffset: 304.8,
  targetDiameter: METHOD_TARGET_DIAMETER.ibs,
  targetTiltDeg: IBS_AIM_TILT_DEG,
  targetOscillationDeg: TARGET_OSCILLATION_DEG,
  sunAngleDeg: 0,
  sag: 0,
};

/** Default plate aim for each coating method. */
export const METHOD_TARGET_TILT = {
  ibs: IBS_AIM_TILT_DEG,
  ebeam: 0,
} as const;

export type CoatingInputs = {
  throwDistance: number;
  sharpness: number;
  partDiameter: number;
  orbitRadius: number;
  spinRatio: number;
  sourceOffset: number;
  targetDiameter?: number;
  targetTiltDeg?: number;
  /** Half-range of the target rock, in degrees. 0 holds the target still. */
  targetOscillationDeg?: number;
  /**
   * Tilt of the sun, in degrees. 0 leaves the planets level, faces up.
   * The planets are fixed to the sun, so this is also their angle to the plume.
   */
  sunAngleDeg?: number;
  /** Long axis of the beam spot. Radial points along the sun radius. */
  erosionAxis?: ErosionAxis;
  radiusCount?: number;
  samplesPerRadius?: number;
  /** Stationary plate between the part and the target. Omitted means no mask. */
  mask?: UniformityMask | null;
  /**
   * Signed sag of the coated face, in millimeters. 0 is plano. Positive is
   * convex toward the target (center closer). Negative is concave toward the
   * target (center farther). The steepest surface is a hemisphere, so |sag|
   * cannot exceed half the optic diameter.
   */
  sag?: number;
};

/**
 * Metal finger in the mask plane, symmetric about the line from the sun
 * to the target. radiiIn are distances from the sun center, in millimeters.
 * halfAngleDeg is how far the metal extends either side of that line.
 * Outside the first and last radius the plate is open.
 */
export type UniformityMask = {
  offsetIn: number;
  sunAngleDeg: number;
  radiiIn: number[];
  halfAngleDeg: number[];
};

export type RadialSample = {
  radius: number;
  planetaryFlux: number;
  stationaryFlux: number;
  planetary: number;
  stationary: number;
};

export type ThicknessProfile = {
  points: RadialSample[];
  planetaryVariationPercent: number;
  stationaryVariationPercent: number;
  planetaryPlusMinusPercent: number;
  stationaryPlusMinusPercent: number;
  orbitsAveraged: number;
  samplesPerRadius: number;
};

export type Emitter = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  area: number;
};

/** Planet center when the planet sits on the sun plate, in millimeters. */
export function plateOrbitRadius(
  sunDiameter: number,
  planetDiameter: number,
): number {
  return Math.max(0, (sunDiameter - planetDiameter) / 2);
}

/** Orbit radius when the sun and planet gears mesh on the outside, in millimeters. */
export function gearMeshOrbitRadius(
  sunDiameter: number,
  planetDiameter: number,
): number {
  return (sunDiameter + planetDiameter) / 2;
}

/** Spins per orbit if the gears matched the sun and planet plate diameters. The fixture gearing is separate and defaults to 20. */
export function gearSpinRatio(
  sunDiameter: number,
  planetDiameter: number,
): number {
  if (!(planetDiameter > 0)) return 0;
  return sunDiameter / planetDiameter;
}

/**
 * Flux from one downward-facing point onto a flat horizontal surface.
 * Returns 0 when the point is not in front of the source.
 */
export function pointFlux(
  x: number,
  y: number,
  sourceX: number,
  sourceY: number,
  throwDistance: number,
  sharpness: number,
): number {
  const dx = x - sourceX;
  const dy = y - sourceY;
  const height = throwDistance;
  const distanceSquared = dx * dx + dy * dy + height * height;
  const distance = Math.sqrt(distanceSquared);
  if (!(distance > 0)) return 0;
  const cosAlpha = height / distance;
  if (cosAlpha <= 0) return 0;
  return Math.pow(cosAlpha, sharpness) * (cosAlpha / distanceSquared);
}

/**
 * Half-angle of the plume lobe for cartoons, in radians: the angle from the
 * preferred leave axis out to where cos^sharpness has fallen to half.
 * Sharpness 0 (flat) is a full hemisphere.
 */
export function plumeHalfAngleRad(sharpness: number): number {
  if (!(sharpness > 1e-9)) return Math.PI / 2;
  const cosHalf = Math.pow(0.5, 1 / sharpness);
  return Math.acos(Math.min(1, Math.max(0, cosHalf)));
}

/**
 * Radius of the plume footprint on a plane a throw distance below the source,
 * using the half-max angle from plumeHalfAngleRad. Capped so a flat plume
 * does not run off to infinity in the cartoon.
 */
export function plumeFootprintRadius(
  throwDistance: number,
  sharpness: number,
  capMultiple = 2,
): number {
  const height = Math.max(0, throwDistance);
  if (!(height > 0)) return 0;
  const half = plumeHalfAngleRad(sharpness);
  const cap = height * Math.max(0.5, capMultiple);
  if (half >= Math.PI / 2 - 1e-6) return cap;
  return Math.min(cap, height * Math.tan(half));
}

/**
 * Ion current across a round, collimated beam. 1 on the flat top, 0 at the
 * edge and outside. The join is smooth: the cosine falloff has zero slope
 * at both ends.
 */
export function beamCurrentDensity(
  rho: number,
  beamRadius: number,
  flatFraction = BEAM_FLAT_FRACTION,
): number {
  if (!(beamRadius > 0) || rho >= beamRadius || rho < 0) return 0;
  const flatRadius = Math.min(0.95, Math.max(0, flatFraction)) * beamRadius;
  if (rho <= flatRadius) return 1;
  const span = beamRadius - flatRadius;
  if (!(span > 0)) return 0;
  const t = (rho - flatRadius) / span;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

/** Footprint of a round beam on a flat target at a fixed incidence angle. */
export function erosionEllipse(
  beamDiameter: number,
  incidenceDeg = ION_INCIDENCE_DEG,
): { shortRadius: number; longRadius: number; incidenceDeg: number } {
  const shortRadius = Math.max(0, beamDiameter) / 2;
  const cosine = Math.cos((incidenceDeg * Math.PI) / 180);
  const longRadius = cosine > 0.05 ? shortRadius / cosine : shortRadius;
  return { shortRadius, longRadius, incidenceDeg };
}

/** Unit normal of the sputtered face. Tilt 0 is straight down. Positive tips inward toward the sun. */
export function plateNormal(tiltDeg: number): {
  x: number;
  y: number;
  z: number;
} {
  const tilt = (tiltDeg * Math.PI) / 180;
  return {
    x: -Math.sin(tilt),
    y: 0,
    z: -Math.cos(tilt),
  };
}

/**
 * Ion velocity for a gun that meets the plate at incidenceDeg when the plate
 * is at aimTiltDeg. The gun sits on the outboard (+x) side. At aim −45° and
 * 45° incidence the beam is horizontal; at aim 0° it climbs into a face-down
 * plate from below and outboard.
 */
export function ionBeamDirection(
  aimTiltDeg: number,
  incidenceDeg = ION_INCIDENCE_DEG,
): { x: number; y: number; z: number } {
  const n = plateNormal(aimTiltDeg);
  const aim = (aimTiltDeg * Math.PI) / 180;
  const tOut = { x: Math.cos(aim), y: 0, z: -Math.sin(aim) };
  const alpha = (incidenceDeg * Math.PI) / 180;
  const toGunX = Math.cos(alpha) * n.x + Math.sin(alpha) * tOut.x;
  const toGunZ = Math.cos(alpha) * n.z + Math.sin(alpha) * tOut.z;
  const length = Math.hypot(toGunX, toGunZ) || 1;
  return { x: -toGunX / length, y: 0, z: -toGunZ / length };
}

/** Mirror of the ion velocity about the plate normal — the preferred IBS leave axis. */
export function specularLeaveDirection(
  ionDir: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const dot = ionDir.x * normal.x + ionDir.y * normal.y + ionDir.z * normal.z;
  const rx = ionDir.x - 2 * dot * normal.x;
  const ry = ionDir.y - 2 * dot * normal.y;
  const rz = ionDir.z - 2 * dot * normal.z;
  const length = Math.hypot(rx, ry, rz) || 1;
  return { x: rx / length, y: ry / length, z: rz / length };
}

/**
 * Emitters on the target. Beam diameter 0 is a single point of weight 1 and
 * leaves along the plate normal (electron-beam pocket). A positive diameter
 * is the ion beam: patches sit on the 45° ellipse and leave about the
 * specular axis for a gun fixed at aimTiltDeg with 45° incidence on that aim.
 *
 * Tilt 0 faces straight down. The default IBS aim (−45°) tips the normal
 * toward the gun so specular leave points straight down. Positive tilt from
 * face-down tips the normal inward toward the sun.
 *
 * Patches are equal areas in the round beam, placed on the ellipse, and
 * weighted by the local ion current. Yield is left at 1 because a constant
 * yield cancels in relative thickness. The long axis follows erosionAxis:
 * "radial" (along the sun radius) or "tangential".
 */
export function targetEmitters(
  offset: number,
  throwDistance: number,
  beamDiameter: number,
  tiltDeg: number,
  longAxis: ErosionAxis = "radial",
  incidenceDeg = ION_INCIDENCE_DEG,
  aimTiltDeg?: number,
): Emitter[] {
  const normal = plateNormal(tiltDeg);
  const aim = aimTiltDeg ?? tiltDeg;
  const leave =
    beamDiameter > 0
      ? specularLeaveDirection(ionBeamDirection(aim, ION_INCIDENCE_DEG), normal)
      : normal;
  if (!(beamDiameter > 0)) {
    return [
      {
        x: offset,
        y: 0,
        z: throwDistance,
        nx: leave.x,
        ny: leave.y,
        nz: leave.z,
        area: 1,
      },
    ];
  }

  const { shortRadius, longRadius } = erosionEllipse(beamDiameter, incidenceDeg);
  const count = BEAM_RINGS * BEAM_ANGLES;
  const beamArea = (Math.PI * shortRadius * shortRadius) / count;
  const cosTilt = Math.cos((tiltDeg * Math.PI) / 180);
  const sinTilt = Math.sin((tiltDeg * Math.PI) / 180);
  const emitters: Emitter[] = [];
  for (let ring = 0; ring < BEAM_RINGS; ring++) {
    const rho = Math.sqrt((shortRadius * shortRadius * (ring + 0.5)) / BEAM_RINGS);
    const current = beamCurrentDensity(rho, shortRadius);
    if (!(current > 0)) continue;
    for (let step = 0; step < BEAM_ANGLES; step++) {
      const phi = (2 * Math.PI * (step + 0.5)) / BEAM_ANGLES;
      const beamAlongLong = rho * Math.cos(phi);
      const beamAlongShort = rho * Math.sin(phi);
      const stretch = shortRadius > 0 ? longRadius / shortRadius : 1;
      const alongLong = beamAlongLong * stretch;
      const alongShort = beamAlongShort;
      const localX = longAxis === "tangential" ? alongShort : alongLong;
      const localY = longAxis === "tangential" ? alongLong : alongShort;
      emitters.push({
        x: offset + localX * cosTilt,
        y: localY,
        z: throwDistance - localX * sinTilt,
        nx: leave.x,
        ny: leave.y,
        nz: leave.z,
        area: current * beamArea,
      });
    }
  }
  return emitters;
}

/**
 * Face angles for one rock of the target, evenly spaced and including both
 * stops. Amplitude 0 is the aim alone. A ±3° swing is every degree:
 * −3, −2, −1, 0, +1, +2, +3. Wider swings use the same seven angles.
 */
export function targetOscillationTilts(
  centerDeg: number,
  amplitudeDeg: number,
): number[] {
  const center = Number.isFinite(centerDeg) ? centerDeg : 0;
  const amplitude = Math.abs(amplitudeDeg);
  if (!(amplitude > 0) || !Number.isFinite(amplitude)) return [center];
  const count = Math.min(6, Math.max(2, Math.round(2 * amplitude)));
  const tilts: number[] = [];
  for (let index = 0; index <= count; index++) {
    const tilt = center - amplitude + (2 * amplitude * index) / count;
    tilts.push(Number(tilt.toFixed(6)));
  }
  return tilts;
}

/**
 * Time average of the target rock. Each stop gets equal time. The ion gun
 * stays fixed at the aim: outboard, meeting the aimed face at 45°. Rocking
 * the plate changes the ion angle on the face and swings the specular leave
 * axis with it. Amplitude 0 is one still target at the aim.
 */
export function oscillatedTargetEmitters(
  offset: number,
  throwDistance: number,
  beamDiameter: number,
  tiltDeg: number,
  longAxis: ErosionAxis = "radial",
  oscillationDeg = 0,
): Emitter[] {
  const tilts = targetOscillationTilts(tiltDeg, oscillationDeg);
  const rocking = Math.abs(oscillationDeg) > 0;
  const groups = tilts.map((tilt) =>
    targetEmitters(
      offset,
      throwDistance,
      beamDiameter,
      tilt,
      longAxis,
      rocking ? ION_INCIDENCE_DEG + (tilt - tiltDeg) : ION_INCIDENCE_DEG,
      tiltDeg,
    ),
  );
  const scale = 1 / groups.length;
  return groups.flatMap((group) =>
    group.map((emitter) => ({ ...emitter, area: emitter.area * scale })),
  );
}

/** Half-angle of the metal, in radians, at a distance rho from the sun center. */
export function maskHalfAngleRadians(mask: UniformityMask, rho: number): number {
  const radii = mask.radiiIn;
  const angles = mask.halfAngleDeg;
  const count = Math.min(radii.length, angles.length);
  if (count === 0) return 0;
  const first = radii[0] ?? 0;
  const last = radii[count - 1] ?? 0;
  if (rho < first || rho > last) return 0;
  let upper = 1;
  while (upper < count && (radii[upper] ?? 0) < rho) upper += 1;
  if (upper >= count) return ((angles[count - 1] ?? 0) * Math.PI) / 180;
  const lower = upper - 1;
  const left = radii[lower] ?? 0;
  const right = radii[upper] ?? left;
  const span = right - left;
  const mix = span > 1e-9 ? (rho - left) / span : 0;
  const degrees = (angles[lower] ?? 0) + mix * ((angles[upper] ?? 0) - (angles[lower] ?? 0));
  return degrees > 0 ? (degrees * Math.PI) / 180 : 0;
}

/**
 * True when the straight ray from a part point to an emitter crosses metal.
 * The plate is parallel to the coated face, offsetIn millimeters toward the target.
 */
export function maskBlocksRay(
  mask: UniformityMask,
  x: number,
  y: number,
  z: number,
  emitterX: number,
  emitterY: number,
  emitterZ: number,
): boolean {
  const beta = (mask.sunAngleDeg * Math.PI) / 180;
  const normalX = Math.sin(beta);
  const normalZ = Math.cos(beta);
  const travelX = emitterX - x;
  const travelY = emitterY - y;
  const travelZ = emitterZ - z;
  const crossing = normalX * travelX + normalZ * travelZ;
  if (!(Math.abs(crossing) > 1e-12)) return false;
  const along = (mask.offsetIn - (normalX * x + normalZ * z)) / crossing;
  if (!(along > 0 && along < 1)) return false;
  const hitX = x + along * travelX;
  const hitY = y + along * travelY;
  const hitZ = z + along * travelZ;
  const planeX = hitX * normalZ - hitZ * normalX;
  const rho = Math.hypot(planeX, hitY);
  const half = maskHalfAngleRadians(mask, rho);
  if (!(half > 0)) return false;
  const angle = Math.atan2(hitY, planeX);
  return Math.abs(angle) < half;
}

/**
 * Flux at one substrate point. The coated face points along (nx, ny, nz).
 * Defaults match a horizontal part in the plane z = 0, facing up.
 * A point that faces away from an emitter, or that the target cannot see,
 * gets nothing from that emitter. A mask blocks an emitter whose ray
 * crosses the metal.
 *
 * When angleAt is set, leave and arrive cosines use that point (the flat
 * planet pose). Distance still uses (x, y, z). That keeps optic sag from
 * steering a raised center off a sharp plume lobe — curvature then only
 * changes throw, so closer glass stays thicker.
 */
export function receivedFlux(
  x: number,
  y: number,
  emitters: readonly Emitter[],
  sharpness: number,
  z = 0,
  nx = 0,
  ny = 0,
  nz = 1,
  mask?: UniformityMask | null,
  angleAt?: { x: number; y: number; z: number } | null,
): number {
  const ax = angleAt?.x ?? x;
  const ay = angleAt?.y ?? y;
  const az = angleAt?.z ?? z;
  let sum = 0;
  for (let index = 0; index < emitters.length; index++) {
    const emitter = emitters[index]!;
    if (
      mask &&
      maskBlocksRay(mask, x, y, z, emitter.x, emitter.y, emitter.z)
    ) {
      continue;
    }
    const adx = ax - emitter.x;
    const ady = ay - emitter.y;
    const adz = az - emitter.z;
    const angleDistance = Math.sqrt(adx * adx + ady * ady + adz * adz);
    if (!(angleDistance > 0)) continue;
    const cosLeave =
      (emitter.nx * adx + emitter.ny * ady + emitter.nz * adz) / angleDistance;
    const cosArrive =
      (nx * -adx + ny * -ady + nz * -adz) / angleDistance;
    if (cosLeave <= 0 || cosArrive <= 0) continue;
    const dx = x - emitter.x;
    const dy = y - emitter.y;
    const dz = z - emitter.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (!(distanceSquared > 0)) continue;
    sum +=
      Math.pow(cosLeave, sharpness) * (cosArrive / distanceSquared) * emitter.area;
  }
  return sum;
}

export type PlanetPose = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
};

/**
 * A point on the planet, and the coated-face normal, before the sun tilt.
 * The coating path keeps the local angle at 0: the planets lie flat on the
 * sun. A nonzero angle here would splay the outer edge on its own, which
 * is not how the planets are mounted.
 */
export function planetPose(
  theta: number,
  radius: number,
  orbitRadius: number,
  spinRatio: number,
  planetAngleDeg = 0,
): PlanetPose {
  const alpha = (planetAngleDeg * Math.PI) / 180;
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const psi = -theta * spinRatio;
  const phi = psi - theta;
  const radial = radius * Math.cos(phi);
  const tangential = radius * Math.sin(phi);
  return {
    x: orbitRadius * cosTheta + radial * cosAlpha * cosTheta - tangential * sinTheta,
    y: orbitRadius * sinTheta + radial * cosAlpha * sinTheta + tangential * cosTheta,
    z: -radial * sinAlpha,
    nx: sinAlpha * cosTheta,
    ny: sinAlpha * sinTheta,
    nz: cosAlpha,
  };
}

/**
 * Turn the sun. Zero leaves the planets level.
 * The axis is across the line from the sun to the target. Zero leaves the
 * sun square to that beam. Positive drops the side of the sun under the target.
 */
export function applySunAngle(pose: PlanetPose, sunAngleDeg: number): PlanetPose {
  if (!sunAngleDeg) return pose;
  const beta = (sunAngleDeg * Math.PI) / 180;
  const cosBeta = Math.cos(beta);
  const sinBeta = Math.sin(beta);
  return {
    x: pose.x * cosBeta + pose.z * sinBeta,
    y: pose.y,
    z: -pose.x * sinBeta + pose.z * cosBeta,
    nx: pose.nx * cosBeta + pose.nz * sinBeta,
    ny: pose.ny,
    nz: -pose.nx * sinBeta + pose.nz * cosBeta,
  };
}

/** Largest |sag| that still makes a sphere on this optic: a hemisphere. */
export function maxOpticSag(diameter: number): number {
  return Math.max(0, diameter) / 2;
}

/**
 * Sphere radius for a signed sag, in millimeters.
 * Sag 0 is flat. Positive sag (convex toward the target) gives positive R.
 * |sag| above a hemisphere returns NaN.
 */
export function radiusFromSag(diameter: number, sag: number): number {
  if (!Number.isFinite(sag) || sag === 0) return 0;
  const half = maxOpticSag(diameter);
  const absSag = Math.abs(sag);
  if (!(half > 0) || absSag > half + 1e-9) return Number.NaN;
  return Math.sign(sag) * ((half * half + absSag * absSag) / (2 * absSag));
}

/**
 * Signed sag of a spherical optic, in millimeters. Positive means the center
 * is closer to the target than the rim. Zero is flat. NaN means the
 * sphere cannot span the optic.
 */
export function opticSag(diameter: number, radiusOfCurvature: number): number {
  const half = maxOpticSag(diameter);
  const radius = radiusOfCurvature;
  if (!Number.isFinite(radius) || radius === 0 || !(half > 0)) return 0;
  if (Math.abs(radius) + 1e-9 < half) return Number.NaN;
  const absRadius = Math.abs(radius);
  const inside = absRadius * absRadius - half * half;
  if (inside < 0) return Number.NaN;
  return Math.sign(radius) * (absRadius - Math.sqrt(inside));
}

/** How far the glass nearest the target stands above the rim plane. */
export function opticHigh(diameter: number, radiusOfCurvature: number): number {
  const sag = opticSag(diameter, radiusOfCurvature);
  if (!Number.isFinite(sag)) return 0;
  return Math.max(0, sag);
}

/** How far the glass nearest the target stands above the rim plane, from sag. */
export function opticHighFromSag(sag: number): number {
  if (!Number.isFinite(sag)) return 0;
  return Math.max(0, sag);
}

/**
 * Height and coated-face normal of one radius on the optic.
 * The rim is on the planet plane. nRadial is outward from the optic center
 * in that plane; nZ points toward the target.
 */
export function opticSurface(
  radius: number,
  diameter: number,
  radiusOfCurvature: number,
): { z: number; nRadial: number; nZ: number } {
  const sag = opticSag(diameter, radiusOfCurvature);
  if (!Number.isFinite(sag) || sag === 0) return { z: 0, nRadial: 0, nZ: 1 };
  const absRadius = Math.abs(radiusOfCurvature);
  const half = Math.max(0, diameter) / 2;
  const rho = Math.min(Math.max(0, radius), half);
  const rise = Math.sqrt(Math.max(0, absRadius * absRadius - rho * rho));
  const length = Math.hypot(rho, rise) || 1;
  if (sag > 0) {
    return {
      z: sag - absRadius + rise,
      nRadial: rho / length,
      nZ: rise / length,
    };
  }
  return {
    z: sag + absRadius - rise,
    nRadial: -rho / length,
    nZ: rise / length,
  };
}

export function describeOpticSag(diameter: number, sag: number): string {
  if (!Number.isFinite(sag) || sag === 0) {
    return "Sag is 0. That is a flat optic.";
  }
  const maxSag = maxOpticSag(diameter);
  const signed = `${sag > 0 ? "+" : "−"}${Math.abs(sag).toFixed(Math.abs(sag) < 1 ? 2 : 1)}`;
  if (!(maxSag > 0) || Math.abs(sag) > maxSag + 1e-9) {
    return `A sag of ${signed} mm cannot cover a ${diameter.toFixed(1)} mm optic. The steepest surface is a hemisphere, so the largest sag is ${maxSag.toFixed(1)} mm.`;
  }
  const radius = radiusFromSag(diameter, sag);
  const radiusText = Number.isFinite(radius)
    ? Math.abs(radius).toFixed(Math.abs(radius) < 100 ? 1 : 0)
    : "—";
  if (sag > 0) {
    return `Sag is ${signed} mm (sphere radius ${radiusText} mm). That is convex toward the target: the center is closer than the rim, so the coat runs thicker at the center.`;
  }
  return `Sag is ${signed} mm (sphere radius ${radiusText} mm). That is concave toward the target: the center is farther than the rim, so the coat runs thicker at the edge.`;
}

/**
 * Where one radius on the optic sits after spin, orbit, and sun tilt.
 * A flat optic matches the old planet pose exactly.
 *
 * Curvature only moves the point closer to or farther from the target
 * (the sag in z). The coated-face normal stays the planet face after sun
 * tilt, not the local sphere tip. Flux callers should take leave/arrive
 * angles from the flat pose and distance from this curved pose, so a
 * convex center (closer) stays thicker and a concave rim (closer) stays
 * thicker even under a sharp plume.
 */
export function coatedPose(
  theta: number,
  radius: number,
  orbitRadius: number,
  spinRatio: number,
  sunAngleDeg: number,
  opticDiameter: number,
  radiusOfCurvature = 0,
): PlanetPose {
  const flat = planetPose(theta, radius, orbitRadius, spinRatio, 0);
  const sag = opticSag(opticDiameter, radiusOfCurvature);
  if (!Number.isFinite(sag) || sag === 0) return applySunAngle(flat, sunAngleDeg);
  const surface = opticSurface(radius, opticDiameter, radiusOfCurvature);
  return applySunAngle(
    { x: flat.x, y: flat.y, z: surface.z, nx: 0, ny: 0, nz: 1 },
    sunAngleDeg,
  );
}

/** Flat planet pose used for leave/arrive angles when the optic is curved. */
export function flatCoatedPose(
  theta: number,
  radius: number,
  orbitRadius: number,
  spinRatio: number,
  sunAngleDeg: number,
): PlanetPose {
  return applySunAngle(
    planetPose(theta, radius, orbitRadius, spinRatio, 0),
    sunAngleDeg,
  );
}

/** Shift a mask out so its clearance is measured from the glass nearest the target. */
export function maskAtClearance(
  mask: UniformityMask,
  opticDiameter: number,
  radiusOfCurvature: number,
): UniformityMask {
  const high = opticHigh(opticDiameter, radiusOfCurvature);
  if (!(high > 0)) return mask;
  return { ...mask, offsetIn: mask.offsetIn + high };
}

export function planetPoint(
  theta: number,
  radius: number,
  orbitRadius: number,
  spinRatio: number,
): { x: number; y: number } {
  const pose = planetPose(theta, radius, orbitRadius, spinRatio, 0);
  return { x: pose.x, y: pose.y };
}

/** How many orbits to integrate so the spin pattern closes, or a long average. */
export function orbitsToAverage(spinRatio: number): number {
  const ratio = Math.abs(spinRatio);
  if (!Number.isFinite(ratio)) return MAX_ORBITS;
  for (let orbits = 1; orbits <= MAX_ORBITS; orbits++) {
    const turns = orbits * ratio;
    if (Math.abs(turns - Math.round(turns)) <= CLOSURE_TOLERANCE) {
      return orbits;
    }
  }
  return MAX_ORBITS;
}

/** Several hundred to a couple thousand steps when the path closes in a few orbits. */
export function samplesForOrbits(orbits: number): number {
  const safeOrbits = Math.max(1, Math.round(orbits));
  if (safeOrbits <= 4) return safeOrbits * 800;
  const perOrbit = Math.max(200, Math.floor(4800 / safeOrbits));
  return safeOrbits * perOrbit;
}

export function averageFluxOnRadius(input: {
  radius: number;
  throwDistance: number;
  sharpness: number;
  orbitRadius: number;
  spinRatio: number;
  sourceOffset: number;
  targetDiameter?: number;
  targetTiltDeg?: number;
  targetOscillationDeg?: number;
  sunAngleDeg?: number;
  erosionAxis?: ErosionAxis;
  orbits?: number;
  steps?: number;
  emitters?: readonly Emitter[];
  mask?: UniformityMask | null;
  opticDiameter?: number;
  radiusOfCurvature?: number;
}): number {
  const orbits = input.orbits ?? orbitsToAverage(input.spinRatio);
  const steps = input.steps ?? samplesForOrbits(orbits);
  if (!(steps > 0)) return 0;
  const emitters =
    input.emitters ??
    oscillatedTargetEmitters(
      input.sourceOffset,
      input.throwDistance,
      input.targetDiameter ?? 0,
      input.targetTiltDeg ?? 0,
      input.erosionAxis ?? "radial",
      input.targetOscillationDeg ?? 0,
    );
  const sunAngleDeg = input.sunAngleDeg ?? 0;
  const opticDiameter = input.opticDiameter ?? 0;
  const radiusOfCurvature = input.radiusOfCurvature ?? 0;
  const mask = input.mask
    ? maskAtClearance(input.mask, opticDiameter, radiusOfCurvature)
    : null;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const theta = (Math.PI * 2 * orbits * i) / steps;
    const flat = flatCoatedPose(
      theta,
      input.radius,
      input.orbitRadius,
      input.spinRatio,
      sunAngleDeg,
    );
    const point = coatedPose(
      theta,
      input.radius,
      input.orbitRadius,
      input.spinRatio,
      sunAngleDeg,
      opticDiameter,
      radiusOfCurvature,
    );
    sum += receivedFlux(
      point.x,
      point.y,
      emitters,
      input.sharpness,
      point.z,
      point.nx,
      point.ny,
      point.nz,
      mask,
      flat,
    );
  }
  return sum / steps;
}

/** Part held still and centered under the target. Chamber offset is not applied. */
export function stationaryFlux(
  radius: number,
  throwDistance: number,
  sharpness: number,
  targetDiameter = 0,
  targetTiltDeg = 0,
  targetOscillationDeg = 0,
): number {
  const emitters = oscillatedTargetEmitters(
    0,
    throwDistance,
    targetDiameter,
    targetTiltDeg,
    "radial",
    targetOscillationDeg,
  );
  return receivedFlux(radius, 0, emitters, sharpness);
}

export function relativeStationaryThickness(
  radius: number,
  throwDistance: number,
  sharpness: number,
): number {
  const center = stationaryFlux(0, throwDistance, sharpness);
  if (!(center > 0)) return Number.NaN;
  return stationaryFlux(radius, throwDistance, sharpness) / center;
}

/** Full swing, (max − min) / mean, in percent. */
export function thicknessVariationPercent(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return Number.NaN;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  const mean = sum / values.length;
  if (!(mean > 0)) return Number.NaN;
  return ((max - min) / mean) * 100;
}

/** Coating uniformity quoted as ± this percent. Half the full swing. */
export function plusMinusPercent(values: number[]): number {
  const fullSwing = thicknessVariationPercent(values);
  if (!Number.isFinite(fullSwing)) return fullSwing;
  return fullSwing / 2;
}

export function thicknessProfile(input: CoatingInputs): ThicknessProfile {
  const partRadius = Math.max(0, input.partDiameter) / 2;
  const radiusCount = Math.max(2, input.radiusCount ?? RADIUS_COUNT);
  const orbitsAveraged = orbitsToAverage(input.spinRatio);
  const samplesPerRadius =
    input.samplesPerRadius ?? samplesForOrbits(orbitsAveraged);
  const targetDiameter = input.targetDiameter ?? 0;
  const targetTiltDeg = input.targetTiltDeg ?? 0;
  const targetOscillationDeg =
    input.targetOscillationDeg ?? DEFAULT_COATING.targetOscillationDeg;
  const sunAngleDeg = input.sunAngleDeg ?? 0;
  const radiusOfCurvature = radiusFromSag(input.partDiameter, input.sag ?? 0);
  const erosionAxis = input.erosionAxis ?? "radial";
  const mask = input.mask
    ? { ...input.mask, sunAngleDeg: input.mask.sunAngleDeg ?? sunAngleDeg }
    : null;
  const movingEmitters = oscillatedTargetEmitters(
    input.sourceOffset,
    input.throwDistance,
    targetDiameter,
    targetTiltDeg,
    erosionAxis,
    targetOscillationDeg,
  );
  const stillEmitters = oscillatedTargetEmitters(
    0,
    input.throwDistance,
    targetDiameter,
    targetTiltDeg,
    erosionAxis,
    targetOscillationDeg,
  );

  const raw: Array<{
    radius: number;
    planetaryFlux: number;
    stationaryFlux: number;
  }> = [];

  for (let index = 0; index < radiusCount; index++) {
    const radius = (partRadius * index) / (radiusCount - 1);
    raw.push({
      radius,
      planetaryFlux: averageFluxOnRadius({
        radius,
        throwDistance: input.throwDistance,
        sharpness: input.sharpness,
        orbitRadius: input.orbitRadius,
        spinRatio: input.spinRatio,
        sourceOffset: input.sourceOffset,
        sunAngleDeg,
        orbits: orbitsAveraged,
        steps: samplesPerRadius,
        emitters: movingEmitters,
        mask,
        opticDiameter: input.partDiameter,
        radiusOfCurvature,
      }),
      stationaryFlux: (() => {
        const flat = flatCoatedPose(0, radius, 0, 0, sunAngleDeg);
        const still = coatedPose(
          0,
          radius,
          0,
          0,
          sunAngleDeg,
          input.partDiameter,
          radiusOfCurvature,
        );
        return receivedFlux(
          still.x,
          still.y,
          stillEmitters,
          input.sharpness,
          still.z,
          still.nx,
          still.ny,
          still.nz,
          null,
          flat,
        );
      })(),
    });
  }

  const centerPlanetary = raw[0]?.planetaryFlux ?? 0;
  const centerStationary = raw[0]?.stationaryFlux ?? 0;
  const points: RadialSample[] = raw.map((sample) => ({
    radius: sample.radius,
    planetaryFlux: sample.planetaryFlux,
    stationaryFlux: sample.stationaryFlux,
    planetary:
      centerPlanetary > 0 ? sample.planetaryFlux / centerPlanetary : Number.NaN,
    stationary:
      centerStationary > 0
        ? sample.stationaryFlux / centerStationary
        : Number.NaN,
  }));
  const planetaryValues = points.map((point) => point.planetary);
  const stationaryValues = points.map((point) => point.stationary);

  return {
    points,
    planetaryVariationPercent: thicknessVariationPercent(planetaryValues),
    stationaryVariationPercent: thicknessVariationPercent(stationaryValues),
    planetaryPlusMinusPercent: plusMinusPercent(planetaryValues),
    stationaryPlusMinusPercent: plusMinusPercent(stationaryValues),
    orbitsAveraged,
    samplesPerRadius,
  };
}

/** True when the target center passes over the disk at some orbit angle. */
export function sourcePassesOverPart(
  orbitRadius: number,
  sourceOffset: number,
  partDiameter: number,
): boolean {
  const closest = Math.abs(orbitRadius - Math.abs(sourceOffset));
  return closest <= Math.max(0, partDiameter) / 2;
}

export type AngleUniformity = {
  angleDeg: number;
  plusMinusPercent: number;
};

export type PlanetAngleSweep = {
  samples: AngleUniformity[];
  atZero: AngleUniformity;
  best: AngleUniformity;
  /** How many degrees stay within 0.2 points of the best. */
  valleyWidthDeg: number;
  /** Angles where uniformity is at or under ±0.5%, if any. */
  underHalfPercent: { fromDeg: number; toDeg: number } | null;
  /** Angles where uniformity is at or under ±0.25%, if any. */
  underQuarterPercent: { fromDeg: number; toDeg: number } | null;
};

function bandAtMost(
  samples: AngleUniformity[],
  limit: number,
): { fromDeg: number; toDeg: number } | null {
  const hits = samples.filter(
    (sample) =>
      Number.isFinite(sample.plusMinusPercent) &&
      sample.plusMinusPercent <= limit,
  );
  const first = hits[0];
  const last = hits[hits.length - 1];
  if (!first || !last) return null;
  return { fromDeg: first.angleDeg, toDeg: last.angleDeg };
}

function angleGrid(minDeg: number, maxDeg: number, stepDeg: number): number[] {
  const angles: number[] = [];
  const steps = Math.round((maxDeg - minDeg) / stepDeg);
  for (let index = 0; index <= steps; index++) {
    const angle = minDeg + index * stepDeg;
    angles.push(Number(angle.toFixed(4)));
  }
  return angles;
}

/**
 * Planetary uniformity versus sun angle inside the ±10° fixture limit.
 * That angle is the planets' angle to the plume. One-degree steps, then
 * 0.2° steps around the flattest angle. The sweep does not go past the
 * limit even if the curve is still improving there. The reported best and
 * the flat-part number use the full radial average.
 */
function profileAtAngle(
  input: CoatingInputs,
  angleDeg: number,
  coarse: boolean,
): AngleUniformity {
  const profile = thicknessProfile({
    ...input,
    sunAngleDeg: angleDeg,
    radiusCount: coarse ? 21 : undefined,
    samplesPerRadius: coarse ? 800 : undefined,
  });
  return { angleDeg, plusMinusPercent: profile.planetaryPlusMinusPercent };
}

export type PlanetAngleSweepJob = {
  done: boolean;
  result: PlanetAngleSweep | null;
  completed: number;
  step: () => void;
};

/** One sun angle at a time, same curve as planetAngleSweep. */
export function startPlanetAngleSweep(input: CoatingInputs): PlanetAngleSweepJob {
  const minDeg = -PLANET_AOI_LIMIT_DEG;
  const maxDeg = PLANET_AOI_LIMIT_DEG;
  const coarseAngles = angleGrid(minDeg, maxDeg, 1);
  const samples: AngleUniformity[] = [];
  let cursor = 0;
  let phase: "coarse" | "fine" | "full" | "done" = "coarse";
  let fineAngles: number[] = [];
  let fullAngles: number[] = [];
  const fullSamples: AngleUniformity[] = [];
  let result: PlanetAngleSweep | null = null;
  let completed = 0;

  function beginFull() {
    const finite = samples.filter((sample) => Number.isFinite(sample.plusMinusPercent));
    const searched = finite.reduce((winner, sample) =>
      sample.plusMinusPercent < winner.plusMinusPercent ? sample : winner,
    );
    fullAngles = [0, searched.angleDeg];
    cursor = 0;
    phase = "full";
  }

  function finish() {
    const atZero = fullSamples[0]!;
    const best = fullSamples[1]!;
    const near = samples.filter(
      (sample) =>
        Number.isFinite(sample.plusMinusPercent) &&
        sample.plusMinusPercent <= best.plusMinusPercent + 0.2,
    );
    const valleyWidthDeg =
      near.length > 0 ? near[near.length - 1]!.angleDeg - near[0]!.angleDeg : 0;
    result = {
      samples,
      atZero,
      best,
      valleyWidthDeg,
      underHalfPercent: bandAtMost(samples, 0.5),
      underQuarterPercent: bandAtMost(samples, 0.25),
    };
    phase = "done";
  }

  const job: PlanetAngleSweepJob = {
    get done() {
      return phase === "done";
    },
    get result() {
      return result;
    },
    get completed() {
      return completed;
    },
    step() {
      if (phase === "done") return;
      if (phase === "coarse") {
        samples.push(profileAtAngle(input, coarseAngles[cursor]!, true));
        completed += 1;
        cursor += 1;
        if (cursor < coarseAngles.length) return;
        const coarseBest = samples
          .filter((sample) => Number.isFinite(sample.plusMinusPercent))
          .reduce((winner, sample) =>
            sample.plusMinusPercent < winner.plusMinusPercent ? sample : winner,
          );
        const fineMin = Math.max(minDeg, coarseBest.angleDeg - 2);
        const fineMax = Math.min(maxDeg, coarseBest.angleDeg + 2);
        fineAngles = angleGrid(fineMin, fineMax, 0.2).filter(
          (angle) => !samples.some((existing) => existing.angleDeg === angle),
        );
        samples.sort((left, right) => left.angleDeg - right.angleDeg);
        cursor = 0;
        phase = "fine";
        if (fineAngles.length === 0) beginFull();
        return;
      }
      if (phase === "fine") {
        samples.push(profileAtAngle(input, fineAngles[cursor]!, true));
        completed += 1;
        cursor += 1;
        if (cursor < fineAngles.length) return;
        samples.sort((left, right) => left.angleDeg - right.angleDeg);
        beginFull();
        return;
      }
      fullSamples.push(profileAtAngle(input, fullAngles[cursor]!, false));
      completed += 1;
      cursor += 1;
      if (cursor < fullAngles.length) return;
      finish();
    },
  };
  return job;
}

export function planetAngleSweep(input: CoatingInputs): PlanetAngleSweep {
  const job = startPlanetAngleSweep(input);
  while (!job.done) job.step();
  if (!job.result) {
    throw new Error("The angle sweep did not finish.");
  }
  return job.result;
}

export function profileToCsv(points: RadialSample[]): string {
  const lines = ["radius_mm,planetary_relative_thickness"];
  for (const point of points) {
    lines.push([point.radius.toFixed(4), point.planetary.toFixed(6)].join(","));
  }
  return `${lines.join("\n")}\n`;
}
