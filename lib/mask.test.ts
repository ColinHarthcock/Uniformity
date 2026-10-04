import { describe, expect, it } from "vitest";
import {
  DEFAULT_COATING,
  planetPose,
  receivedFlux,
  targetEmitters,
  thicknessProfile,
  type UniformityMask,
} from "./coating";
import { designUniformityMask, maskOutlinePoints, maskSearchGaps } from "./mask";

const openMask: UniformityMask = {
  offsetIn: 1,
  sunAngleDeg: 0,
  radiiIn: [1, 6, 14],
  halfAngleDeg: [0, 0, 0],
};

describe("uniformity mask", () => {
  it("leaves a curved optic unchanged when the plate is fully open, and never adds thickness", () => {
    const curved = {
      ...DEFAULT_COATING,
      focalLength: -8,
      radiusCount: 9,
      samplesPerRadius: 80,
    };
    const bare = thicknessProfile(curved);
    const open = thicknessProfile({ ...curved, mask: openMask });
    const blocking = thicknessProfile({
      ...curved,
      mask: { ...openMask, halfAngleDeg: [4, 8, 4] },
    });
    expect(Number.isFinite(bare.planetaryPlusMinusPercent)).toBe(true);
    for (let index = 0; index < bare.points.length; index++) {
      expect(open.points[index]?.planetaryFlux).toBeCloseTo(bare.points[index]?.planetaryFlux ?? 0, 8);
      const before = bare.points[index]?.planetaryFlux ?? 0;
      const after = blocking.points[index]?.planetaryFlux ?? 0;
      expect(after).toBeLessThanOrEqual(before + 1e-9);
    }
  });

  it("leaves the coat unchanged when the plate is fully open", () => {
    const shared = {
      ...DEFAULT_COATING,
      radiusCount: 11,
      samplesPerRadius: 160,
    };
    const bare = thicknessProfile(shared);
    const open = thicknessProfile({ ...shared, mask: openMask });
    expect(open.points.length).toBe(bare.points.length);
    for (let index = 0; index < bare.points.length; index++) {
      expect(open.points[index]?.planetaryFlux).toBeCloseTo(bare.points[index]?.planetaryFlux ?? 0, 8);
      expect(open.points[index]?.planetary).toBeCloseTo(bare.points[index]?.planetary ?? 0, 8);
    }
  });

  it("never makes a radius thicker than the unmasked coat", () => {
    const mask: UniformityMask = {
      offsetIn: 1.2,
      sunAngleDeg: 0,
      radiiIn: [1, 6, 8, 14],
      halfAngleDeg: [2, 6, 6, 2],
    };
    const shared = {
      ...DEFAULT_COATING,
      radiusCount: 11,
      samplesPerRadius: 160,
    };
    const bare = thicknessProfile(shared);
    const covered = thicknessProfile({ ...shared, mask });
    let trimmed = false;
    for (let index = 0; index < bare.points.length; index++) {
      const before = bare.points[index]?.planetaryFlux ?? 0;
      const after = covered.points[index]?.planetaryFlux ?? 0;
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      if (after < before - 1e-8) trimmed = true;
    }
    expect(trimmed).toBe(true);
  });

  it("lets one point see only part of the elliptical spot", () => {
    const pose = planetPose(0, 0, 6, 20, 0);
    const emitters = targetEmitters(12, 12, 6.3, 0);
    const face = {
      x: pose.x,
      y: pose.y,
      z: pose.z,
      nx: pose.nx,
      ny: pose.ny,
      nz: pose.nz,
    };
    const open = receivedFlux(face.x, face.y, emitters, 1, face.z, face.nx, face.ny, face.nz);
    const partialMask: UniformityMask = {
      offsetIn: 1,
      sunAngleDeg: 0,
      radiiIn: [4, 8, 12],
      halfAngleDeg: [1.5, 1.5, 1.5],
    };
    const partial = receivedFlux(
      face.x,
      face.y,
      emitters,
      1,
      face.z,
      face.nx,
      face.ny,
      face.nz,
      partialMask,
    );
    const shut = receivedFlux(
      face.x,
      face.y,
      emitters,
      1,
      face.z,
      face.nx,
      face.ny,
      face.nz,
      { ...partialMask, halfAngleDeg: [30, 30, 30] },
    );
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(open);
    expect(shut).toBeLessThan(partial);
    expect(maskOutlinePoints(openMask)).toEqual([]);
    expect(maskOutlinePoints(partialMask).length).toBeGreaterThan(8);
  });

  it("keeps a near-part search within 4 inches of the glass", () => {
    const gaps = maskSearchGaps(DEFAULT_COATING.throwDistance, "substrate");
    expect(gaps.some((gap) => gap > 0.1 && gap < 3)).toBe(true);
    expect(gaps.every((gap) => gap <= 4)).toBe(true);
    const design = designUniformityMask(DEFAULT_COATING, "substrate");
    expect(design.placement).toBe("substrate");
    expect(design.offsetIn).toBeLessThanOrEqual(4);
    expectBestGap(design);
  }, 90000);

  it("keeps a near-target search in the last 4 inches before the target", () => {
    const gaps = maskSearchGaps(DEFAULT_COATING.throwDistance, "target");
    expect(gaps.length).toBeGreaterThan(2);
    expect(gaps.every((gap) => gap >= 8 - 1e-6 && gap < 12)).toBe(true);
    const raised = maskSearchGaps(12, "target", 1.09);
    expect(raised.every((gap) => gap + 1.09 < 12 - 0.14)).toBe(true);
    expect(raised.every((gap) => 12 - (gap + 1.09) <= 4.05)).toBe(true);
    const design = designUniformityMask(DEFAULT_COATING, "target");
    expect(design.placement).toBe("target");
    expect(design.offsetIn).toBeGreaterThan(8);
    expect(design.offsetIn).toBeLessThan(12);
    expectBestGap(design);
  }, 90000);
});

function expectBestGap(design: ReturnType<typeof designUniformityMask>) {
  const best = Math.min(...design.gaps.map((gap) => gap.plusMinusPercent));
  const winner = design.gaps.find((gap) => gap.plusMinusPercent === best);
  expect(winner?.offsetIn).toBe(design.offsetIn);
  const index = design.gaps.findIndex((gap) => gap.offsetIn === design.offsetIn);
  expect(index).toBeGreaterThanOrEqual(0);
  if (index > 0) {
    expect(design.gaps[index]!.plusMinusPercent).toBeLessThanOrEqual(
      design.gaps[index - 1]!.plusMinusPercent,
    );
  }
  if (index >= 0 && index < design.gaps.length - 1) {
    expect(design.gaps[index]!.plusMinusPercent).toBeLessThanOrEqual(
      design.gaps[index + 1]!.plusMinusPercent,
    );
  }
}
