"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useElementWidth } from "@/components/use-element-width";
import {
  erosionEllipse,
  ionBeamDirection,
  ION_INCIDENCE_DEG,
  opticHighFromSag,
  opticSurface,
  plateNormal,
  plumeFootprintRadius,
  radiusFromSag,
  specularLeaveDirection,
} from "@/lib/coating";

const BLUE = "#143a66";

function BeamFromTheRight({
  muzzleX,
  muzzleY,
  hitX,
  hitY,
  bodyPx,
}: {
  muzzleX: number;
  muzzleY: number;
  hitX: number;
  hitY: number;
  bodyPx: number;
}) {
  const dx = hitX - muzzleX;
  const dy = hitY - muzzleY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const head = 11;
  const wing = 5;
  const tipX = hitX;
  const tipY = hitY;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  return (
    <g aria-label="Ion gun outboard of the target. The ion flux meets the target face at about 45°.">
      <g transform={`translate(${muzzleX} ${muzzleY}) rotate(${(Math.atan2(-uy, -ux) * 180) / Math.PI})`}>
        <rect x={0} y={-6} width={bodyPx} height={12} rx={1} fill={BLUE} />
      </g>
      <text
        x={muzzleX - ux * (bodyPx / 2)}
        y={muzzleY - uy * (bodyPx / 2) - 14}
        textAnchor="middle"
        fill="#526273"
        fontSize={12}
      >
        Ion gun
      </text>
      <line
        x1={muzzleX}
        y1={muzzleY}
        x2={baseX}
        y2={baseY}
        stroke={BLUE}
        strokeWidth={2}
      />
      <polygon
        points={`${tipX},${tipY} ${baseX + px * wing},${baseY + py * wing} ${baseX - px * wing},${baseY - py * wing}`}
        fill={BLUE}
      />
    </g>
  );
}

export type DiagramGeometry = {
  sunDiameter: number;
  planetDiameter: number;
  partDiameter: number;
  orbitRadius: number;
  spinRatio: number;
  sourceOffset: number;
  targetDiameter: number;
  throwDistance: number;
  /** Plume sharpness (cos^n). Narrows the coat lobe in the cartoon. */
  sharpness: number;
  sunAngleDeg: number;
  targetTiltDeg: number;
  targetOscillationDeg: number;
  /** Gap from the coated face toward the target, when a mask has been designed. */
  maskOffsetIn?: number | null;
  /** 0 is flat. Positive lifts the center toward the target. */
  sag?: number;
};

type ChamberDiagramProps = {
  geometry: DiagramGeometry;
};

export function ChamberDiagram({ geometry }: ChamberDiagramProps) {
  const { ref, width } = useElementWidth(280);
  const height = Math.max(220, Math.min(420, Math.round(width * 0.7)));
  const [theta, setTheta] = useState(0);
  const [playing, setPlaying] = useState(false);
  const thetaRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const durationMs = 7000;

    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      thetaRef.current += (elapsed / durationMs) * Math.PI * 2;
      if (thetaRef.current >= Math.PI * 2) {
        thetaRef.current = 0;
        setTheta(0);
        setPlaying(false);
        return;
      }
      setTheta(thetaRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const sunRadius = Math.max(0, geometry.sunDiameter) / 2;
  const planetRadius = Math.max(0, geometry.planetDiameter) / 2;
  const partRadius = Math.max(0, geometry.partDiameter) / 2;
  const outer = Math.max(planetRadius, partRadius);
  const beamSpot =
    geometry.targetDiameter > 0 ? erosionEllipse(geometry.targetDiameter) : null;
  const spotLong = beamSpot?.longRadius ?? 0;
  const spotShort = beamSpot?.shortRadius ?? 0;
  const reach = Math.abs(geometry.orbitRadius) + outer;
  const plumeRadius = plumeFootprintRadius(
    geometry.throwDistance,
    geometry.sharpness,
  );
  // Cartoon: ion-beam / pocket sits on the sun center (same stack as the side
  // view). Distance from sun center still drives the coat calculation.
  const bounds = {
    minX: Math.min(-sunRadius, -reach, -spotLong, -plumeRadius),
    maxX: Math.max(sunRadius, reach, spotLong, plumeRadius),
    minY: Math.min(-sunRadius, -reach, -spotShort, -plumeRadius),
    maxY: Math.max(sunRadius, reach, spotShort, plumeRadius),
  };
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const worldPad = Math.max(spanX, spanY) * 0.06;
  const padded = {
    minX: bounds.minX - worldPad,
    maxX: bounds.maxX + worldPad,
    minY: bounds.minY - worldPad,
    maxY: bounds.maxY + worldPad,
  };
  const margin = { left: 16, right: 16, top: 12, bottom: 36 };
  const areaWidth = Math.max(1, width - margin.left - margin.right);
  const areaHeight = Math.max(1, height - margin.top - margin.bottom);
  const scale = Math.min(
    areaWidth / (padded.maxX - padded.minX),
    areaHeight / (padded.maxY - padded.minY),
  );
  const centerX = (padded.minX + padded.maxX) / 2;
  const centerY = (padded.minY + padded.maxY) / 2;
  const originX = margin.left + areaWidth / 2;
  const originY = margin.top + areaHeight / 2;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const toX = (x: number) => round2(originX + (x - centerX) * scale);
  const toY = (y: number) => round2(originY - (y - centerY) * scale);
  const toR = (radius: number) => round2(Math.max(0, radius * scale));

  const planetX = geometry.orbitRadius * Math.cos(theta);
  const planetY = geometry.orbitRadius * Math.sin(theta);
  const psi = -theta * geometry.spinRatio;
  const markX = planetX + partRadius * Math.cos(psi);
  const markY = planetY + partRadius * Math.sin(psi);
  const sourceX = toX(0);
  const sourceY = toY(0);

  const mmPerPixel = scale > 0 ? 1 / scale : 1;
  const targetBar = Math.min(110, width * 0.34);
  const rawMm = targetBar * mmPerPixel;
  const barStep = rawMm >= 250 ? 100 : rawMm >= 100 ? 50 : rawMm >= 40 ? 25 : 10;
  const barMm = Math.max(barStep, Math.round(rawMm / barStep) * barStep);
  const barPx = round2(barMm * scale);
  const barLabel = Number.isInteger(barMm)
    ? `${barMm} mm`
    : `${barMm.toFixed(0)} mm`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top view</CardTitle>
        <CardDescription>
          Drawn to scale for the sun and planet. The filled disk is the part.
          The mark on the part shows its spin, opposite the direction it travels
          around the sun.
          {spotLong > 0
            ? " The white ellipse is the ion-beam spot on the target, drawn on the sun center so the plume and sun line up. Its long axis points along the sun radius."
            : " The dot is the electron-beam melt pocket, drawn on the sun center so the plume and sun line up."}{" "}
          The soft ring is the coat plume on the sun; plume sharpness pulls that
          ring in or lets it out.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={playing}
            onClick={() => {
              if (playing) {
                setPlaying(false);
                return;
              }
              thetaRef.current = 0;
              setTheta(0);
              setPlaying(true);
            }}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? "Stop" : "Play one orbit"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="w-full min-w-0">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Top view of the sun, the planet path, the part, and the target. The plume sits on the sun center. Plume sharpness ${geometry.sharpness}.`}
            className="block max-w-full"
          >
            <circle
              cx={toX(0)}
              cy={toY(0)}
              r={toR(Math.abs(geometry.orbitRadius))}
              fill="none"
              stroke="#8aa0b8"
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
            <circle
              cx={toX(0)}
              cy={toY(0)}
              r={toR(sunRadius)}
              fill="#e7eef6"
              stroke={BLUE}
              strokeWidth={1.5}
            />
            {plumeRadius > 0.05 ? (
              <circle
                cx={toX(0)}
                cy={toY(0)}
                r={toR(plumeRadius)}
                fill="#8aa0b8"
                fillOpacity={0.14}
                stroke="#8aa0b8"
                strokeWidth={1.25}
                strokeDasharray="3 3"
              />
            ) : null}
            <circle
              cx={toX(planetX)}
              cy={toY(planetY)}
              r={toR(planetRadius)}
              fill="none"
              stroke={BLUE}
              strokeWidth={1.5}
            />
            <circle
              cx={toX(planetX)}
              cy={toY(planetY)}
              r={toR(partRadius)}
              fill={BLUE}
              fillOpacity={0.16}
              stroke={BLUE}
              strokeWidth={1}
            />
            {partRadius > 0 ? (
              <line
                x1={toX(planetX)}
                y1={toY(planetY)}
                x2={toX(markX)}
                y2={toY(markY)}
                stroke={BLUE}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ) : null}
            {spotLong > 0 ? (
              <ellipse
                cx={sourceX}
                cy={sourceY}
                rx={toR(spotLong)}
                ry={toR(spotShort)}
                fill="#ffffff"
                fillOpacity={0.85}
                stroke={BLUE}
                strokeWidth={1.5}
              />
            ) : (
              <circle cx={sourceX} cy={sourceY} r={5} fill={BLUE} />
            )}
            <line
              x1={16}
              x2={16 + barPx}
              y1={height - 16}
              y2={height - 16}
              stroke={BLUE}
              strokeWidth={1.5}
            />
            <line
              x1={16}
              x2={16}
              y1={height - 20}
              y2={height - 12}
              stroke={BLUE}
              strokeWidth={1.5}
            />
            <line
              x1={16 + barPx}
              x2={16 + barPx}
              y1={height - 20}
              y2={height - 12}
              stroke={BLUE}
              strokeWidth={1.5}
            />
            <text x={16} y={height - 24} fill="#526273" fontSize={12}>
              {barLabel}
            </text>
          </svg>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full border bg-[#e7eef6]"
              style={{ borderColor: BLUE }}
              aria-hidden="true"
            />
            Sun
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-0 w-5 border-t border-dashed border-[#8aa0b8]"
              aria-hidden="true"
            />
            Planet path
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full border bg-transparent"
              style={{ borderColor: BLUE }}
              aria-hidden="true"
            />
            Planet
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full border"
              style={{ borderColor: BLUE, backgroundColor: "rgba(20, 58, 102, 0.16)" }}
              aria-hidden="true"
            />
            Part (optic)
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-0 w-5 border-t-2"
              style={{ borderColor: BLUE }}
              aria-hidden="true"
            />
            Spin mark
          </li>
          <li className="flex items-center gap-2">
            {spotLong > 0 ? (
              <span
                className="inline-block h-2.5 w-4 rounded-full border bg-white"
                style={{ borderColor: BLUE }}
                aria-hidden="true"
              />
            ) : (
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: BLUE }}
                aria-hidden="true"
              />
            )}
            {spotLong > 0 ? "Ion-beam spot on target" : "Melt pocket"}
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full border border-dashed border-[#8aa0b8] bg-[#8aa0b8]/20"
              aria-hidden="true"
            />
            Coat plume
          </li>
        </ul>
        <SideView geometry={geometry} width={width} />
      </CardContent>
    </Card>
  );
}

function SideView({
  geometry,
  width,
}: {
  geometry: DiagramGeometry;
  width: number;
}) {
  const height = 210;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const partRadius = Math.max(0, geometry.partDiameter) / 2;
  const planetRadius = Math.max(0, geometry.planetDiameter) / 2;
  const sunRadius = Math.max(0, geometry.sunDiameter) / 2;
  const beamSpot =
    geometry.targetDiameter > 0 ? erosionEllipse(geometry.targetDiameter) : null;
  const spotLong = beamSpot?.longRadius ?? 0;
  const throwDistance = geometry.throwDistance;
  const sunBeta = (geometry.sunAngleDeg * Math.PI) / 180;
  const cosBeta = Math.cos(sunBeta);
  const sinBeta = Math.sin(sunBeta);
  function tipSun(x: number, z: number) {
    return {
      x: x * cosBeta + z * sinBeta,
      z: -x * sinBeta + z * cosBeta,
    };
  }
  const sag = geometry.sag ?? 0;
  const curvature = radiusFromSag(geometry.partDiameter, sag);
  const high = opticHighFromSag(sag);
  const margin = { left: 36, right: 16, top: 16, bottom: 28 };
  const rock = Math.abs(geometry.targetOscillationDeg);
  const aim = geometry.targetTiltDeg;
  function spotEnds(deltaDeg: number) {
    const tilt = ((aim + deltaDeg) * Math.PI) / 180;
    const cosine = Math.cos(tilt);
    const sine = Math.sin(tilt);
    return {
      x1: geometry.sourceOffset - spotLong * cosine,
      z1: throwDistance + spotLong * sine,
      x2: geometry.sourceOffset + spotLong * cosine,
      z2: throwDistance - spotLong * sine,
    };
  }
  const meanSpot = spotEnds(0);
  const lowSpot = rock > 0 ? spotEnds(-rock) : null;
  const highSpot = rock > 0 ? spotEnds(rock) : null;
  // VacCoat IBS layout: gun fixed for the plate aim, ion and coat mirrored
  // about the plate normal. At the default −45° aim the beam is horizontal
  // from outboard and the coat leaves straight down onto the sun plane.
  const ion = ionBeamDirection(aim, ION_INCIDENCE_DEG);
  const normal = plateNormal(aim);
  const coat = specularLeaveDirection(ion, normal);
  const gunBody = spotLong > 0 ? 2.2 : 0;
  const hitX = geometry.sourceOffset;
  const hitZ = throwDistance;
  const roomOut = Math.max(2.4, spotLong + 2.2);
  const roomBelow = Math.max(1.6, throwDistance - 0.4);
  const gunReach = Math.min(
    ion.x < -0.05 ? roomOut / -ion.x : roomOut,
    ion.z > 0.05 ? roomBelow / ion.z : roomBelow,
  );
  const gunX = hitX - ion.x * gunReach;
  const gunZ = hitZ - ion.z * gunReach;
  const gunTailX = gunX - ion.x * gunBody;
  const gunTailZ = gunZ - ion.z * gunBody;
  const normalLen = Math.min(2.6, Math.max(1.4, throwDistance * 0.22));
  const normalTip = {
    x: hitX + normal.x * normalLen,
    z: hitZ + normal.z * normalLen,
  };
  // Side-view cartoon: sun center under the coat where the plume meets the
  // sun plane. The optic sits on its planet on that sun. Orbit radius stays
  // in the top view and in the physics; this stack is the deposition cut.
  const sunPlaneNormal = tipSun(0, 1);
  const coatDot = coat.x * sunPlaneNormal.x + coat.z * sunPlaneNormal.z;
  const hitDot = hitX * sunPlaneNormal.x + hitZ * sunPlaneNormal.z;
  const coatToSunT = Math.abs(coatDot) > 1e-9 ? -hitDot / coatDot : -hitZ;
  const plumeOnSun = {
    x: hitX + coat.x * coatToSunT,
    z: hitZ + coat.z * coatToSunT,
  };
  const sunCenter = tipSun(0, 0);
  const stackShiftX = plumeOnSun.x - sunCenter.x;
  const stackShiftZ = plumeOnSun.z - sunCenter.z;
  function onStack(point: { x: number; z: number }) {
    return { x: point.x + stackShiftX, z: point.z + stackShiftZ };
  }
  const curveSteps = 24;
  const opticCurve: Array<{ x: number; z: number }> = [];
  for (let index = 0; index <= curveSteps; index++) {
    const local = -partRadius + (2 * partRadius * index) / curveSteps;
    const surface = opticSurface(Math.abs(local), geometry.partDiameter, curvature);
    // Planet/optic centered on the sun under the plume for this cartoon.
    opticCurve.push(onStack(tipSun(local, surface.z)));
  }
  const inner = opticCurve[0] ?? onStack(tipSun(-partRadius, 0));
  const outer = opticCurve[opticCurve.length - 1] ?? onStack(tipSun(partRadius, 0));
  const sunHalf = Math.max(sunRadius, planetRadius, partRadius, 1);
  const sunNear = onStack(tipSun(-sunHalf, 0));
  const sunFar = onStack(tipSun(sunHalf, 0));
  const sunMid = onStack(tipSun(0, 0));
  const planetInner = onStack(tipSun(-planetRadius, 0));
  const planetOuter = onStack(tipSun(planetRadius, 0));
  const maskGap = geometry.maskOffsetIn ?? 0;
  const maskLift = maskGap > 0 ? maskGap + high : 0;
  const maskNormal = tipSun(0, 1);
  const maskInner =
    maskLift > 0
      ? { x: inner.x + maskNormal.x * maskLift, z: inner.z + maskNormal.z * maskLift }
      : null;
  const maskOuter =
    maskLift > 0
      ? { x: outer.x + maskNormal.x * maskLift, z: outer.z + maskNormal.z * maskLift }
      : null;
  const coatTip = plumeOnSun;
  const plumeRadius = plumeFootprintRadius(throwDistance, geometry.sharpness);
  const sunAlong = tipSun(1, 0);
  const sunAlongLen = Math.hypot(sunAlong.x, sunAlong.z) || 1;
  const sunUnit = { x: sunAlong.x / sunAlongLen, z: sunAlong.z / sunAlongLen };
  const plumeLeft = {
    x: sunMid.x - sunUnit.x * plumeRadius,
    z: sunMid.z - sunUnit.z * plumeRadius,
  };
  const plumeRight = {
    x: sunMid.x + sunUnit.x * plumeRadius,
    z: sunMid.z + sunUnit.z * plumeRadius,
  };
  const fluxLabelX = (hitX + gunX) / 2;
  const fluxLabelZ = (hitZ + gunZ) / 2;
  const spotZs = [
    meanSpot.z1,
    meanSpot.z2,
    lowSpot?.z1,
    lowSpot?.z2,
    highSpot?.z1,
    highSpot?.z2,
  ].filter((value): value is number => value != null);
  const spotXs = [
    meanSpot.x1,
    meanSpot.x2,
    lowSpot?.x1,
    lowSpot?.x2,
    highSpot?.x1,
    highSpot?.x2,
  ].filter((value): value is number => value != null);
  const curveXs = opticCurve.map((point) => point.x);
  const curveZs = opticCurve.map((point) => point.z);
  const minX =
    Math.min(
      sunNear.x,
      sunFar.x,
      sunMid.x,
      planetInner.x,
      planetOuter.x,
      plumeLeft.x,
      plumeRight.x,
      inner.x,
      outer.x,
      maskInner?.x ?? sunNear.x,
      maskOuter?.x ?? sunNear.x,
      coatTip.x,
      normalTip.x,
      ...spotXs,
      ...curveXs,
    ) - 0.6;
  const maxX =
    Math.max(
      sunNear.x,
      sunFar.x,
      sunMid.x,
      planetInner.x,
      planetOuter.x,
      plumeLeft.x,
      plumeRight.x,
      inner.x,
      outer.x,
      maskInner?.x ?? sunNear.x,
      maskOuter?.x ?? sunNear.x,
      gunX,
      gunTailX,
      ...spotXs,
      ...curveXs,
    ) + 0.8;
  const minZ =
    Math.min(
      sunNear.z,
      sunFar.z,
      sunMid.z,
      planetInner.z,
      planetOuter.z,
      plumeLeft.z,
      plumeRight.z,
      inner.z,
      outer.z,
      maskInner?.z ?? sunNear.z,
      maskOuter?.z ?? sunNear.z,
      gunZ,
      gunTailZ,
      coatTip.z,
      normalTip.z,
      ...spotZs,
      ...curveZs,
    ) - 0.8;
  const maxZ =
    Math.max(
      throwDistance,
      sunNear.z,
      sunFar.z,
      sunMid.z,
      planetInner.z,
      planetOuter.z,
      plumeLeft.z,
      plumeRight.z,
      inner.z,
      outer.z,
      maskInner?.z ?? sunNear.z,
      maskOuter?.z ?? sunNear.z,
      gunZ,
      gunTailZ,
      ...spotZs,
      ...curveZs,
    ) + 1.3;
  const areaWidth = Math.max(1, width - margin.left - margin.right);
  const areaHeight = Math.max(1, height - margin.top - margin.bottom);
  const scale = Math.min(
    areaWidth / Math.max(1, maxX - minX),
    areaHeight / Math.max(1, maxZ - minZ),
  );
  const toX = (x: number) => round2(margin.left + (x - minX) * scale);
  const toZ = (z: number) => round2(margin.top + (maxZ - z) * scale);
  const tiltLabel =
    geometry.sunAngleDeg > 0.05
      ? "The side under the target is down."
      : geometry.sunAngleDeg < -0.05
        ? "The side under the target is up."
        : "The planets are level.";
  const plateDeg = Math.round(aim);
  const leaveDeg = Math.round((Math.atan2(-coat.x, -coat.z) * 180) / Math.PI);
  const leave =
    Math.abs(leaveDeg) < 8
      ? "straight down onto the parts"
      : leaveDeg > 0
        ? "down and inward toward the sun"
        : "down and outward";
  const rockLabel =
    rock > 0.05
      ? `The target rocks ±${rock}° about that plate aim.`
      : "The target is held still.";
  const platePhrase =
    Math.abs(plateDeg) < 1
      ? "face-down"
      : `${plateDeg}° from face-down (normal tipped ${plateDeg < 0 ? "toward the gun" : "toward the sun"})`;

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-foreground">Side view</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">
        Looking along the tilt axis. The sun center sits under the coat plume,
        and the optic sits on its planet on that sun. Orbit radius is in the top
        view. The shaded lobe is the coat plume; higher plume sharpness pulls it
        in.{" "}
        {spotLong > 0
          ? `The target plate is ${platePhrase}. The ion gun is outboard. The ion flux and the coat are mirrored about the plate normal (dashed), about 45° each side — like VacCoat’s IBS sketch. Sputtered atoms leave ${leave}, not along the normal. `
          : "The dot is the electron-beam pocket where the target sits. There is no ion-beam ellipse and no ion flux. "}
        The planets are fixed to the sun, so the sun angle
        is their angle to that plume. {rockLabel} {tiltLabel}.
      </p>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Side view. The sun center is under the coat plume. Plume sharpness ${geometry.sharpness}. The optic sits on a planet on that sun. The sun, and the planets fixed to it, are tilted ${geometry.sunAngleDeg} degrees. ${tiltLabel}`}
        className="mt-2 block max-w-full"
      >
        <defs>
          <marker id="coat-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#526273" />
          </marker>
        </defs>
        {plumeRadius > 0.05 ? (
          <path
            d={`M${toX(hitX)} ${toZ(hitZ)} L${toX(plumeLeft.x)} ${toZ(plumeLeft.z)} L${toX(plumeRight.x)} ${toZ(plumeRight.z)} Z`}
            fill="#8aa0b8"
            fillOpacity={0.18}
            stroke="#8aa0b8"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ) : null}
        <line
          x1={toX(sunNear.x)}
          x2={toX(sunFar.x)}
          y1={toZ(sunNear.z)}
          y2={toZ(sunFar.z)}
          stroke="#8aa0b8"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {planetRadius > 0 ? (
          <line
            x1={toX(planetInner.x)}
            x2={toX(planetOuter.x)}
            y1={toZ(planetInner.z)}
            y2={toZ(planetOuter.z)}
            stroke={BLUE}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ) : null}
        {spotLong > 0 ? (
          <g>
            {lowSpot ? (
              <line
                x1={toX(lowSpot.x1)}
                x2={toX(lowSpot.x2)}
                y1={toZ(lowSpot.z1)}
                y2={toZ(lowSpot.z2)}
                stroke="#8aa0b8"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : null}
            {highSpot ? (
              <line
                x1={toX(highSpot.x1)}
                x2={toX(highSpot.x2)}
                y1={toZ(highSpot.z1)}
                y2={toZ(highSpot.z2)}
                stroke="#8aa0b8"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : null}
            <line
              x1={toX(meanSpot.x1)}
              x2={toX(meanSpot.x2)}
              y1={toZ(meanSpot.z1)}
              y2={toZ(meanSpot.z2)}
              stroke={BLUE}
              strokeWidth={8}
              strokeLinecap="round"
            />
            <BeamFromTheRight
              muzzleX={toX(gunX)}
              muzzleY={toZ(gunZ)}
              hitX={toX(hitX)}
              hitY={toZ(hitZ)}
              bodyPx={Math.max(22, gunBody * scale)}
            />
            <line
              x1={toX(hitX)}
              y1={toZ(hitZ)}
              x2={toX(normalTip.x)}
              y2={toZ(normalTip.z)}
              stroke="#8aa0b8"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <line
              x1={toX(hitX)}
              y1={toZ(hitZ)}
              x2={toX(coatTip.x)}
              y2={toZ(coatTip.z)}
              stroke="#526273"
              strokeWidth={1.5}
              markerEnd="url(#coat-arrow)"
            />
            <text
              x={toX(fluxLabelX) + 10}
              y={toZ(fluxLabelZ)}
              textAnchor="start"
              fill="#526273"
              fontSize={12}
            >
              Ion flux
            </text>
            <text
              x={toX((hitX + normalTip.x) / 2) + 6}
              y={toZ((hitZ + normalTip.z) / 2) - 4}
              textAnchor="start"
              fill="#8aa0b8"
              fontSize={11}
            >
              Normal
            </text>
            <text
              x={toX((hitX + coatTip.x) / 2) - 8}
              y={toZ((hitZ + coatTip.z) / 2)}
              textAnchor="end"
              fill="#526273"
              fontSize={12}
            >
              Coat
            </text>
          </g>
        ) : (
          <circle cx={toX(geometry.sourceOffset)} cy={toZ(throwDistance)} r={4} fill={BLUE} />
        )}
        {maskInner && maskOuter ? (
          <line
            x1={toX(maskInner.x)}
            y1={toZ(maskInner.z)}
            x2={toX(maskOuter.x)}
            y2={toZ(maskOuter.z)}
            stroke="#526273"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        ) : null}
        <path
          d={opticCurve
            .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point.x)} ${toZ(point.z)}`)
            .join(" ")}
          fill="none"
          stroke={BLUE}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {maskInner && maskOuter ? (
          <text x={toX((maskInner.x + maskOuter.x) / 2)} y={toZ((maskInner.z + maskOuter.z) / 2) - 6} fill="#526273" fontSize={12}>
            Mask
          </text>
        ) : null}
        <text
          x={toX(sunMid.x)}
          y={toZ(sunMid.z) + 18}
          textAnchor="middle"
          fill="#526273"
          fontSize={12}
        >
          Sun
        </text>
        {planetRadius > 0 ? (
          <text
            x={toX(planetOuter.x) - 4}
            y={toZ(planetOuter.z) + 18}
            textAnchor="end"
            fill="#526273"
            fontSize={11}
          >
            Planet
          </text>
        ) : null}
        <text x={toX(outer.x) + 6} y={toZ(outer.z) - 8} fill="#526273" fontSize={12}>
          Outer
        </text>
        {spotLong > 0 ? (
          <text
            x={toX(hitX)}
            y={toZ(Math.max(meanSpot.z1, meanSpot.z2)) - 10}
            textAnchor="middle"
            fill="#526273"
            fontSize={12}
          >
            Target
          </text>
        ) : (
          <text x={toX(geometry.sourceOffset) + 8} y={toZ(throwDistance) - 8} fill="#526273" fontSize={12}>
            Pocket
          </text>
        )}
      </svg>
    </div>
  );
}
