import { describe, expect, it } from "vitest";
import {
  averageFluxOnRadius,
  DEFAULT_COATING,
  gearMeshOrbitRadius,
  gearSpinRatio,
  beamCurrentDensity,
  erosionEllipse,
  IBS_SOURCE_DIAMETER_IN,
  METHOD_SHARPNESS,
  METHOD_TARGET_DIAMETER,
  orbitsToAverage,
  planetAngleSweep,
  planetPoint,
  applySunAngle,
  coatedPose,
  opticSag,
  radiusFromFocalLength,
  opticSurface,
  planetPose,
  plateOrbitRadius,
  plusMinusPercent,
  pointFlux,
  profileToCsv,
  receivedFlux,
  relativeStationaryThickness,
  samplesForOrbits,
  sourcePassesOverPart,
  stationaryFlux,
  TARGET_OSCILLATION_DEG,
  targetEmitters,
  targetOscillationTilts,
  oscillatedTargetEmitters,
  thicknessProfile,
  thicknessVariationPercent,
} from "./coating";

const stillDisk = {
  throwDistance: 12,
  sharpness: 2,
  partDiameter: 8,
  orbitRadius: 0,
  spinRatio: 0,
  sourceOffset: 0,
};

describe("stationary disk", () => {
  it("gets thinner toward the edge for n at least 1, source 12 in above center", () => {
    for (const sharpness of [1, 2, 8, 12]) {
      const profile = thicknessProfile({ ...stillDisk, sharpness });
      expect(profile.points[0]?.radius).toBe(0);
      expect(profile.points[0]?.stationary).toBeCloseTo(1, 10);
      for (let index = 1; index < profile.points.length; index++) {
        const outer = profile.points[index];
        const inner = profile.points[index - 1];
        expect(outer!.radius).toBeGreaterThan(inner!.radius);
        expect(outer!.stationary).toBeLessThan(inner!.stationary);
      }
    }
  });

  it("varies less across the part when the throw distance is larger", () => {
    const near = thicknessProfile({ ...stillDisk, throwDistance: 12 });
    const far = thicknessProfile({ ...stillDisk, throwDistance: 24 });
    expect(far.stationaryVariationPercent).toBeLessThan(
      near.stationaryVariationPercent,
    );
  });

  it("has a thinner edge when the plume is more directional", () => {
    const broad = thicknessProfile({ ...stillDisk, sharpness: 2 });
    const narrow = thicknessProfile({ ...stillDisk, sharpness: 12 });
    const broadEdge = broad.points.at(-1)?.stationary;
    const narrowEdge = narrow.points.at(-1)?.stationary;
    expect(broadEdge).toBeDefined();
    expect(narrowEdge).toBeDefined();
    expect(narrowEdge!).toBeLessThan(broadEdge!);
  });

  it("matches the cosine-to-the-n law on a flat plate", () => {
    const height = 12;
    const sharpness = 2;
    const radius = 5;
    const distance = Math.hypot(radius, height);
    expect(pointFlux(0, 0, 0, 0, height, sharpness)).toBeCloseTo(
      1 / height ** 2,
      12,
    );
    expect(stationaryFlux(0, height, sharpness)).toBeCloseTo(1 / height ** 2, 12);
    expect(
      relativeStationaryThickness(radius, height, sharpness),
    ).toBeCloseTo((height / distance) ** (sharpness + 3), 12);
    expect(pointFlux(0, 0, 0, 0, -4, sharpness)).toBe(0);
  });
});

const correctedDefaults = {
  throwDistance: DEFAULT_COATING.throwDistance,
  sharpness: DEFAULT_COATING.sharpness,
  partDiameter: DEFAULT_COATING.partDiameter,
  orbitRadius: DEFAULT_COATING.orbitRadius,
  spinRatio: DEFAULT_COATING.spinRatio,
  sourceOffset: DEFAULT_COATING.sourceOffset,
  targetDiameter: DEFAULT_COATING.targetDiameter,
  targetTiltDeg: DEFAULT_COATING.targetTiltDeg,
  targetOscillationDeg: DEFAULT_COATING.targetOscillationDeg,
};

describe("throw distance", () => {
  function atThrow(method: "ibs" | "ebeam", throwDistance: number) {
    return thicknessProfile({
      ...DEFAULT_COATING,
      throwDistance,
      sharpness: METHOD_SHARPNESS[method],
      targetDiameter: METHOD_TARGET_DIAMETER[method],
    });
  }

  it("makes a still part more even as the throw grows", () => {
    for (const method of ["ibs", "ebeam"] as const) {
      const near = atThrow(method, 6);
      const mid = atThrow(method, 12);
      const far = atThrow(method, 36);
      expect(mid.stationaryPlusMinusPercent).toBeLessThan(
        near.stationaryPlusMinusPercent,
      );
      expect(far.stationaryPlusMinusPercent).toBeLessThan(
        mid.stationaryPlusMinusPercent,
      );
    }
  });

  it("lets the orbiting part get worse past the flattest height, with the target offset fixed", () => {
    const ionAt12 = atThrow("ibs", 12);
    const ionAt24 = atThrow("ibs", 24);
    const electronAt15 = atThrow("ebeam", 15);
    const electronAt24 = atThrow("ebeam", 24);
    expect(ionAt12.planetaryPlusMinusPercent).toBeCloseTo(0.4058, 3);
    expect(ionAt24.planetaryPlusMinusPercent).toBeGreaterThan(
      ionAt12.planetaryPlusMinusPercent,
    );
    expect(electronAt24.planetaryPlusMinusPercent).toBeGreaterThan(
      electronAt15.planetaryPlusMinusPercent,
    );
  });
});

describe("planetary average", () => {
  it("is finite and positive at every radius for the default geometry", () => {
    const profile = thicknessProfile(correctedDefaults);

    expect(profile.points.length).toBeGreaterThanOrEqual(40);
    expect(profile.orbitsAveraged).toBe(1);
    expect(profile.samplesPerRadius).toBeGreaterThanOrEqual(400);
    expect(profile.samplesPerRadius).toBeLessThanOrEqual(2500);
    expect(profile.points[0]?.planetary).toBeCloseTo(1, 10);
    expect(DEFAULT_COATING.sharpness).toBe(1);
    expect(profile.planetaryPlusMinusPercent).toBeGreaterThan(0);
    expect(profile.planetaryPlusMinusPercent).toBeLessThan(0.5);
    expect(profile.planetaryPlusMinusPercent).toBeCloseTo(0.405813, 4);
    const repeat = thicknessProfile(correctedDefaults);
    expect(repeat.planetaryPlusMinusPercent).toBe(profile.planetaryPlusMinusPercent);
    expect(profile.planetaryPlusMinusPercent).toBeCloseTo(
      profile.planetaryVariationPercent / 2,
      10,
    );

    for (const point of profile.points) {
      expect(Number.isFinite(point.planetaryFlux)).toBe(true);
      expect(point.planetaryFlux).toBeGreaterThan(0);
      expect(Number.isFinite(point.planetary)).toBe(true);
      expect(point.planetary).toBeGreaterThan(0);
    }
  });

  it("is much flatter for a broad cosine than for a cos^12 plume in the same geometry", () => {
    const shared = {
      throwDistance: 12,
      partDiameter: 8,
      orbitRadius: 14,
      spinRatio: 2.5,
      sourceOffset: 0,
      targetDiameter: 0,
      targetTiltDeg: 0,
    };
    const broad = thicknessProfile({ ...shared, sharpness: 1 });
    const narrow = thicknessProfile({ ...shared, sharpness: 12 });
    expect(narrow.planetaryPlusMinusPercent).toBeGreaterThan(50);
    expect(broad.planetaryPlusMinusPercent).toBeLessThan(5);
    expect(broad.planetaryPlusMinusPercent).toBeLessThan(
      narrow.planetaryPlusMinusPercent / 10,
    );
  });

  it("is much flatter on the plate than on a 14 in orbit for a narrow on-axis plume", () => {
    const shared = {
      throwDistance: 12,
      sharpness: 12,
      partDiameter: 8,
      spinRatio: 2.5,
      sourceOffset: 0,
      targetDiameter: 0,
      targetTiltDeg: 0,
    };
    const onPlate = thicknessProfile({ ...shared, orbitRadius: 6 });
    const outsideMesh = thicknessProfile({ ...shared, orbitRadius: 14 });
    expect(onPlate.planetaryPlusMinusPercent).toBeLessThan(
      outsideMesh.planetaryPlusMinusPercent / 3,
    );
  });

  it("matches the still part when nothing is moving and the source is centered", () => {
    const radius = 2;
    const throwDistance = 12;
    const sharpness = 5;
    const averaged = averageFluxOnRadius({
      radius,
      throwDistance,
      sharpness,
      orbitRadius: 0,
      spinRatio: 0,
      sourceOffset: 0,
    });
    expect(averaged).toBeCloseTo(stationaryFlux(radius, throwDistance, sharpness), 10);
  });
});

describe("geometry helpers", () => {
  it("seats an 8 inch planet on a 20 inch plate at 6 inches, not at the 14 inch outside mesh", () => {
    expect(plateOrbitRadius(20, 8)).toBe(6);
    expect(gearMeshOrbitRadius(20, 8)).toBe(14);
    expect(gearSpinRatio(20, 8)).toBe(2.5);
    expect(DEFAULT_COATING.orbitRadius).toBe(6);
    expect(DEFAULT_COATING.sourceOffset).toBe(12);
    expect(DEFAULT_COATING.spinRatio).toBe(20);
    expect(DEFAULT_COATING.targetDiameter).toBe(IBS_SOURCE_DIAMETER_IN);
    expect(DEFAULT_COATING.targetOscillationDeg).toBe(TARGET_OSCILLATION_DEG);
    expect(TARGET_OSCILLATION_DEG).toBe(3);
    expect(METHOD_SHARPNESS.ibs).toBe(1);
    expect(METHOD_SHARPNESS.ebeam).toBe(2);
    expect(METHOD_TARGET_DIAMETER.ibs).toBe(IBS_SOURCE_DIAMETER_IN);
    expect(METHOD_TARGET_DIAMETER.ebeam).toBe(0);
  });

  it("changes the default flat coat when the source is a point instead of the ion beam", () => {
    const ionBeam = thicknessProfile(DEFAULT_COATING);
    const electronBeam = thicknessProfile({
      ...DEFAULT_COATING,
      sharpness: METHOD_SHARPNESS.ebeam,
      targetDiameter: METHOD_TARGET_DIAMETER.ebeam,
    });
    expect(targetEmitters(12, 12, 0, 0)).toHaveLength(1);
    expect(ionBeam.planetaryPlusMinusPercent).toBeCloseTo(0.405813, 5);
    expect(electronBeam.planetaryPlusMinusPercent).toBeCloseTo(0.868893, 5);
  });

  it("projects the round beam into an ellipse stretched by 45°", () => {
    const beamRadius = IBS_SOURCE_DIAMETER_IN / 2;
    const spot = erosionEllipse(IBS_SOURCE_DIAMETER_IN);
    expect(spot.longRadius / spot.shortRadius).toBeCloseTo(Math.SQRT2, 10);
    expect(beamCurrentDensity(0, beamRadius)).toBe(1);
    expect(beamCurrentDensity(beamRadius * 0.5, beamRadius)).toBe(1);
    expect(beamCurrentDensity(beamRadius * 0.9, beamRadius)).toBeLessThan(1);
    expect(beamCurrentDensity(beamRadius, beamRadius)).toBe(0);

    const emitters = targetEmitters(0, 12, IBS_SOURCE_DIAMETER_IN, 0, "radial");
    expect(emitters.length).toBeGreaterThan(10);
    let maxX = 0;
    let maxY = 0;
    let maxWeight = 0;
    let minWeight = Infinity;
    for (const emitter of emitters) {
      const nx = emitter.x / spot.longRadius;
      const ny = emitter.y / spot.shortRadius;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1 + 1e-9);
      maxX = Math.max(maxX, Math.abs(emitter.x));
      maxY = Math.max(maxY, Math.abs(emitter.y));
      maxWeight = Math.max(maxWeight, emitter.area);
      minWeight = Math.min(minWeight, emitter.area);
    }
    expect(maxX).toBeGreaterThan(spot.shortRadius);
    expect(maxX).toBeGreaterThan(maxY * 1.25);
    expect(maxWeight).toBeGreaterThan(minWeight);
  });

  it("treats a zero-width target as the downward point source", () => {
    const emitters = targetEmitters(0, 12, 0, 0);
    expect(emitters).toHaveLength(1);
    expect(receivedFlux(0, 0, emitters, 2)).toBeCloseTo(
      pointFlux(0, 0, 0, 0, 12, 2),
      12,
    );
    expect(stationaryFlux(3, 12, 2, 0, 0)).toBeCloseTo(
      pointFlux(3, 0, 0, 0, 12, 2),
      12,
    );
  });

  it("is flatter across a still part when the beam spot is an ellipse instead of a point", () => {
    const point = thicknessProfile({ ...stillDisk, sharpness: 1, targetDiameter: 0 });
    const disk = thicknessProfile({
      ...stillDisk,
      sharpness: 1,
      targetDiameter: IBS_SOURCE_DIAMETER_IN,
    });
    expect(disk.stationaryPlusMinusPercent).toBeLessThan(
      point.stationaryPlusMinusPercent,
    );
  });

  it("keeps a flat part at 0° and drops the outer edge when the angle is positive", () => {
    const flat = planetPose(Math.PI / 2, 2, 10, 1, 0);
    const untilted = planetPoint(Math.PI / 2, 2, 10, 1);
    expect(flat.x).toBeCloseTo(untilted.x, 12);
    expect(flat.y).toBeCloseTo(untilted.y, 12);
    expect(flat.z).toBeCloseTo(0, 12);
    expect(flat.nz).toBeCloseTo(1, 12);

    const outer = planetPose(0, 4, 6, 0, 20);
    expect(outer.z).toBeLessThan(0);
    expect(outer.nx).toBeGreaterThan(0);
    const inner = planetPose(Math.PI, 4, 6, 0, 20);
    expect(inner.z).toBeGreaterThan(0);
  });

  it("stays inside ±10° and is flattest just off square to the beam", () => {
    const sweep = planetAngleSweep(correctedDefaults);
    const angles = sweep.samples.map((sample) => sample.angleDeg);
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(-10);
    expect(Math.max(...angles)).toBeLessThanOrEqual(10);
    expect(sweep.atZero.plusMinusPercent).toBeCloseTo(0.405813, 4);
    expect(sweep.best.angleDeg).toBeCloseTo(-2.4, 5);
    expect(sweep.best.plusMinusPercent).toBeCloseTo(0.052217, 4);
    expect(sweep.best.plusMinusPercent).toBeLessThan(sweep.atZero.plusMinusPercent);
    expect(sweep.underHalfPercent).toEqual({ fromDeg: -4, toDeg: 0 });
    expect(sweep.underQuarterPercent).toEqual({ fromDeg: -3.6, toDeg: -1 });
  }, 20000);

  it("keeps the over-the-path percent when the target sits 6 in out", () => {
    const rocking = thicknessProfile({
      ...correctedDefaults,
      sourceOffset: 6,
      spinRatio: 2.5,
    });
    expect(rocking.planetaryPlusMinusPercent).toBeCloseTo(3.777557, 4);
    const still = thicknessProfile({
      ...correctedDefaults,
      sourceOffset: 6,
      spinRatio: 2.5,
      targetOscillationDeg: 0,
    });
    expect(still.planetaryPlusMinusPercent).toBeCloseTo(3.777056, 4);
  });

  it("keeps the still-target result when the rock is turned off", () => {
    const still = thicknessProfile({ ...correctedDefaults, targetOscillationDeg: 0 });
    const rocking = thicknessProfile(correctedDefaults);
    expect(
      Math.abs(rocking.planetaryPlusMinusPercent - still.planetaryPlusMinusPercent),
    ).toBeLessThan(0.01);
  });

  it("rocks the target through ±3° and keeps the same ion current", () => {
    expect(targetOscillationTilts(0, 3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(targetOscillationTilts(4, 0)).toEqual([4]);
    const still = targetEmitters(6, 12, IBS_SOURCE_DIAMETER_IN, 0);
    const rock = oscillatedTargetEmitters(
      6,
      12,
      IBS_SOURCE_DIAMETER_IN,
      0,
      "radial",
      3,
    );
    const weight = (emitters: { area: number }[]) =>
      emitters.reduce((sum, emitter) => sum + emitter.area, 0);
    expect(weight(rock)).toBeCloseTo(weight(still), 8);
    const aimedIn = targetEmitters(0, 12, IBS_SOURCE_DIAMETER_IN, 3, "radial", 42);
    const aimedOut = targetEmitters(0, 12, IBS_SOURCE_DIAMETER_IN, -3, "radial", 48);
    expect(aimedIn.every((emitter) => emitter.nx < 0)).toBe(true);
    expect(aimedOut.every((emitter) => emitter.nx > 0)).toBe(true);
    const reach = (emitters: { x: number }[]) =>
      Math.max(...emitters.map((emitter) => Math.abs(emitter.x)));
    expect(reach(aimedOut)).toBeGreaterThan(reach(aimedIn));
  });

  it("collects less on an edge-on part than on a face-on part", () => {
    const faceOn = thicknessProfile({ ...correctedDefaults, sunAngleDeg: 0 });
    const edgeOn = thicknessProfile({ ...correctedDefaults, sunAngleDeg: -85 });
    expect(edgeOn.points[0]?.planetaryFlux).toBeLessThan(
      (faceOn.points[0]?.planetaryFlux ?? 0) / 2,
    );
  });

  it("turns the sun relative to the sputter and leaves 0° square to the beam", () => {
    const pose = planetPose(0, 0, 6, 0, 0);
    expect(applySunAngle(pose, 0)).toBe(pose);
    const tipped = applySunAngle(pose, 20);
    expect(tipped.z).toBeLessThan(0);
    expect(tipped.nx).toBeGreaterThan(0);
    const level = thicknessProfile(correctedDefaults);
    const leaned = thicknessProfile({ ...correctedDefaults, sunAngleDeg: 10 });
    expect(leaned.planetaryPlusMinusPercent).toBeGreaterThan(
      level.planetaryPlusMinusPercent,
    );
  });

  it("spins the planet opposite the orbit", () => {
    const point = planetPoint(Math.PI / 2, 2, 10, 1);
    expect(point.x).toBeCloseTo(0, 12);
    expect(point.y).toBeCloseTo(8, 12);
  });

  it("uses a long average when the spin ratio does not repeat quickly", () => {
    expect(orbitsToAverage(2.5)).toBe(2);
    expect(orbitsToAverage(20)).toBe(1);
    expect(samplesForOrbits(1)).toBe(800);
    expect(samplesForOrbits(2)).toBe(1600);
    expect(orbitsToAverage(Math.PI)).toBe(24);
  });

  it("knows when the source passes over the part", () => {
    expect(sourcePassesOverPart(14, 0, 8)).toBe(false);
    expect(sourcePassesOverPart(14, 14, 8)).toBe(true);
    expect(sourcePassesOverPart(6, 12, 8)).toBe(false);
    expect(sourcePassesOverPart(6, 6, 8)).toBe(true);
  });

  it("reports full swing as (max − min) / mean, and the ± figure as half of that", () => {
    const fullSwing = (0.5 / 0.75) * 100;
    expect(thicknessVariationPercent([1, 0.5, 0.75])).toBeCloseTo(fullSwing, 10);
    expect(plusMinusPercent([1, 0.5, 0.75])).toBeCloseTo(fullSwing / 2, 10);
  });

  it("writes a radial profile csv", () => {
    const csv = profileToCsv([
      {
        radius: 0,
        planetaryFlux: 1,
        stationaryFlux: 1,
        planetary: 1,
        stationary: 1,
      },
    ]);
    expect(csv.startsWith(
      "radius_in,planetary_relative_thickness,stationary_relative_thickness\n",
    )).toBe(true);
    expect(csv).toContain("0.0000,1.000000,1.000000");
  });

  it("matches the old flat optic when the focal length is 0", () => {
    expect(DEFAULT_COATING.focalLength).toBe(0);
    expect(opticSag(8, radiusFromFocalLength(0))).toBe(0);
    const flat = applySunAngle(planetPose(0.4, 3, 6, 20, 0), 0);
    const posed = coatedPose(0.4, 3, 6, 20, 0, 8, radiusFromFocalLength(0));
    expect(posed.x).toBeCloseTo(flat.x, 12);
    expect(posed.y).toBeCloseTo(flat.y, 12);
    expect(posed.z).toBeCloseTo(flat.z, 12);
    expect(posed.nz).toBeCloseTo(flat.nz, 12);
  });

  it("makes an 8 inch optic at a focal length of +2 inches a hemisphere farther from the target", () => {
    expect(radiusFromFocalLength(2)).toBe(-4);
    expect(opticSag(8, radiusFromFocalLength(2))).toBeCloseTo(-4, 8);
    expect(opticSurface(0, 8, radiusFromFocalLength(2)).z).toBeCloseTo(-4, 8);
    expect(opticSag(8, radiusFromFocalLength(1))).toBeNaN();
    expect(opticSag(8, radiusFromFocalLength(-2))).toBeCloseTo(4, 8);
    const farther = radiusFromFocalLength(10);
    const closer = radiusFromFocalLength(-10);
    const expected = 20 - Math.sqrt(400 - 16);
    expect(opticSag(8, closer)).toBeCloseTo(expected, 8);
    expect(opticSag(8, farther)).toBeCloseTo(-expected, 8);
    expect(opticSurface(0, 8, closer).z).toBeCloseTo(expected, 8);
    expect(opticSurface(4, 8, closer).z).toBeCloseTo(0, 8);
    expect(opticSurface(4, 8, closer).nRadial).toBeGreaterThan(0);
    expect(opticSurface(4, 8, farther).nRadial).toBeLessThan(0);
    expect(opticSurface(0, 8, farther).z).toBeLessThan(0);
  });

  it("changes the coat when the optic is curved", () => {
    const shared = {
      ...DEFAULT_COATING,
      radiusCount: 7,
      samplesPerRadius: 80,
    };
    const flat = thicknessProfile(shared);
    const hollow = thicknessProfile({ ...shared, focalLength: 6 });
    const bulging = thicknessProfile({ ...shared, focalLength: -6 });
    expect(hollow.planetaryPlusMinusPercent).not.toBeCloseTo(
      flat.planetaryPlusMinusPercent,
      2,
    );
    expect(bulging.planetaryPlusMinusPercent).not.toBeCloseTo(
      flat.planetaryPlusMinusPercent,
      2,
    );
    expect(bulging.points[0]?.planetaryFlux).not.toBeCloseTo(
      bulging.points[bulging.points.length - 1]?.planetaryFlux ?? 0,
      2,
    );
  });
});
