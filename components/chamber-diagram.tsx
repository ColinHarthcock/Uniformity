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
import { erosionEllipse, opticHigh, opticSag, opticSurface, radiusFromFocalLength } from "@/lib/coating";

const BLUE = "#143a66";

export type DiagramGeometry = {
  sunDiameter: number;
  planetDiameter: number;
  partDiameter: number;
  orbitRadius: number;
  spinRatio: number;
  sourceOffset: number;
  targetDiameter: number;
  throwDistance: number;
  sunAngleDeg: number;
  targetTiltDeg: number;
  targetOscillationDeg: number;
  /** Gap from the coated face toward the target, when a mask has been designed. */
  maskOffsetIn?: number | null;
  /** 0 is flat. Positive lifts the center toward the target. */
  focalLength?: number;
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
  const bounds = {
    minX: Math.min(-sunRadius, -reach, geometry.sourceOffset - spotLong),
    maxX: Math.max(sunRadius, reach, geometry.sourceOffset + spotLong),
    minY: Math.min(-sunRadius, -reach, -spotShort),
    maxY: Math.max(sunRadius, reach, spotShort),
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
  const sourceX = toX(geometry.sourceOffset);
  const sourceY = toY(0);

  const inchesPerPixel = scale > 0 ? 1 / scale : 1;
  const targetBar = Math.min(110, width * 0.34);
  const rawInches = targetBar * inchesPerPixel;
  const barStep = rawInches >= 10 ? 5 : rawInches >= 4 ? 2 : rawInches >= 1 ? 1 : 0.5;
  const barInches = Math.max(barStep, Math.round(rawInches / barStep) * barStep);
  const barPx = round2(barInches * scale);
  const barLabel = Number.isInteger(barInches)
    ? `${barInches} in`
    : `${barInches.toFixed(1)} in`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top view</CardTitle>
        <CardDescription>
          Drawn to scale. The filled disk is the part. The mark on the part
          shows its spin, opposite the direction it travels around the sun.
          {spotLong > 0
            ? " The ellipse is the ion beam on the target. Its long axis points along the sun radius."
            : " The dot is the electron-beam pocket, sitting where the target sits."}
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
            aria-label="Top view of the sun, the planet path, the part, and the target, drawn to scale."
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
              className="inline-block size-3 rounded-full border"
              style={{ borderColor: BLUE, backgroundColor: "rgba(20, 58, 102, 0.16)" }}
              aria-hidden="true"
            />
            Planet and part
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rotate-45"
              style={{ backgroundColor: BLUE }}
              aria-hidden="true"
            />
            Beam spot
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
  const orbit = geometry.orbitRadius;
  const partRadius = Math.max(0, geometry.partDiameter) / 2;
  const beamSpot =
    geometry.targetDiameter > 0 ? erosionEllipse(geometry.targetDiameter) : null;
  const spotLong = beamSpot?.longRadius ?? 0;
  const throwDistance = geometry.throwDistance;
  const beamReach = 4.5;
  const sunBeta = (geometry.sunAngleDeg * Math.PI) / 180;
  const cosBeta = Math.cos(sunBeta);
  const sinBeta = Math.sin(sunBeta);
  function tipSun(x: number, z: number) {
    return {
      x: x * cosBeta + z * sinBeta,
      z: -x * sinBeta + z * cosBeta,
    };
  }
  const curvature = radiusFromFocalLength(geometry.focalLength ?? 0);
  const sag = opticSag(geometry.partDiameter, curvature);
  const high = Number.isFinite(sag) ? opticHigh(geometry.partDiameter, curvature) : 0;
  const curveSteps = 24;
  const opticCurve: Array<{ x: number; z: number }> = [];
  for (let index = 0; index <= curveSteps; index++) {
    const local = -partRadius + (2 * partRadius * index) / curveSteps;
    const surface = opticSurface(Math.abs(local), geometry.partDiameter, curvature);
    opticCurve.push(tipSun(orbit + local, surface.z));
  }
  const inner = opticCurve[0] ?? tipSun(orbit - partRadius, 0);
  const outer = opticCurve[opticCurve.length - 1] ?? tipSun(orbit + partRadius, 0);
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
  const minX = Math.min(0, inner.x, outer.x, maskInner?.x ?? 0, maskOuter?.x ?? 0, ...spotXs, ...curveXs) - 0.6;
  const maxX = Math.max(inner.x, outer.x, maskInner?.x ?? 0, maskOuter?.x ?? 0, ...spotXs, ...curveXs, geometry.sourceOffset + beamReach * 0.8) + 0.8;
  const minZ = Math.min(0, inner.z, outer.z, maskInner?.z ?? 0, maskOuter?.z ?? 0, ...spotZs, ...curveZs) - 0.8;
  const maxZ = Math.max(throwDistance + beamReach * 0.8, inner.z, outer.z, maskInner?.z ?? 0, maskOuter?.z ?? 0, ...spotZs, ...curveZs) + 1.2;
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
        : "The planets are square to the beam.";
  const rockLabel =
    rock > 0.05
      ? `The target rocks ±${rock}° about its aim.`
      : "The target is held still.";

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-foreground">Side view</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">
        Looking along the tilt axis, with the sun to the left and the outer
        edge to the right.{" "}
        {spotLong > 0
          ? "The ion beam comes in from the outer side, 45° off straight down."
          : "The dot is the electron-beam pocket. There is no ion-beam ellipse and no 45° beam."}{" "}
        The planets are fixed to the sun, so the sun angle
        is their angle to that downward sputter. {rockLabel} {tiltLabel}.
      </p>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Side view. The sun, and the planets fixed to it, are tilted ${geometry.sunAngleDeg} degrees. ${tiltLabel}`}
        className="mt-2 block max-w-full"
      >
        <line
          x1={toX(0)}
          x2={toX(0)}
          y1={toZ(minZ)}
          y2={toZ(Math.min(maxZ, throwDistance))}
          stroke="#8aa0b8"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <line
          x1={toX(Math.max(0, minX))}
          x2={toX(maxX)}
          y1={toZ(0)}
          y2={toZ(0)}
          stroke="#d5dee8"
          strokeWidth={1}
        />
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
              strokeWidth={4}
              strokeLinecap="round"
            />
            <line
              x1={toX(geometry.sourceOffset + Math.sin(Math.PI / 4) * beamReach)}
              y1={toZ(throwDistance + Math.cos(Math.PI / 4) * beamReach)}
              x2={toX(geometry.sourceOffset)}
              y2={toZ(throwDistance)}
              stroke={BLUE}
              strokeWidth={1.5}
            />
            <text
              x={toX(geometry.sourceOffset + 1.2)}
              y={toZ(throwDistance + beamReach * 0.55)}
              fill="#526273"
              fontSize={12}
            >
              45° beam
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
        <text x={toX(0) + 4} y={toZ(throwDistance * 0.45)} fill="#526273" fontSize={12}>
          Sun
        </text>
        <text x={toX(outer.x) - 28} y={toZ(outer.z) + 16} fill="#526273" fontSize={12}>
          Outer
        </text>
        <text x={toX(geometry.sourceOffset) - 18} y={toZ(throwDistance) - 8} fill="#526273" fontSize={12}>
          {rock > 0.05 ? `Target ±${rock}°` : "Target"}
        </text>
      </svg>
    </div>
  );
}
