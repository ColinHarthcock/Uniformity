"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatUniformity } from "@/components/angle-sweep-plot";
import { useElementWidth } from "@/components/use-element-width";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeOpticSag, opticHigh, radiusFromFocalLength, type CoatingInputs, type RadialSample } from "@/lib/coating";
import {
  advanceMaskSearch,
  assembleMaskDesign,
  maskOutlineCsv,
  maskOutlinePoints,
  maskSearchDone,
  startMaskSearch,
  type MaskDesign,
  type MaskPlacement,
  type MaskSearchState,
} from "@/lib/mask";

type MaskPanelProps = {
  coating: CoatingInputs;
  onOffset: (inches: number | null) => void;
};

function coatingKey(coating: CoatingInputs): string {
  return JSON.stringify({
    throwDistance: coating.throwDistance,
    sourceOffset: coating.sourceOffset,
    spinRatio: coating.spinRatio,
    sunAngleDeg: coating.sunAngleDeg ?? 0,
    targetOscillationDeg: coating.targetOscillationDeg ?? 0,
    partDiameter: coating.partDiameter,
    focalLength: coating.focalLength ?? 0,
    orbitRadius: coating.orbitRadius,
    sharpness: coating.sharpness,
    targetDiameter: coating.targetDiameter ?? 0,
    targetTiltDeg: coating.targetTiltDeg ?? 0,
  });
}

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MaskPanel({ coating, onOffset }: MaskPanelProps) {
  const key = coatingKey(coating);
  const coatingRef = useRef(coating);
  coatingRef.current = coating;
  const onOffsetRef = useRef(onOffset);
  onOffsetRef.current = onOffset;
  const [placement, setPlacement] = useState<MaskPlacement>("substrate");
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ key: string; design: MaskDesign } | null>(null);
  const resultKey = `${key}|${placement}`;
  const cancelSearch = useRef(0);
  const placementRef = useRef(placement);
  placementRef.current = placement;

  useEffect(() => {
    cancelSearch.current += 1;
    setStatus("");
  }, [placement]);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let pending = 0;
    let state: MaskSearchState | null = null;
    const token = cancelSearch.current;
    const place = placementRef.current;
    const snapshot = coatingRef.current;
    const stillCurrent = () => !cancelled && cancelSearch.current === token;
    const step = () => {
      if (!stillCurrent()) {
        if (!cancelled) setStatus("");
        return;
      }
      if (!state) {
        setStatus("Working out the open coat, before any metal.");
        onOffsetRef.current(null);
        pending = window.setTimeout(() => {
          if (!stillCurrent()) return;
          state = startMaskSearch(snapshot, place);
          step();
        }, 0);
        return;
      }
      if (maskSearchDone(state)) {
        const gaps = state.gaps.slice().sort((left, right) => left.offsetIn - right.offsetIn);
        setStatus("Scoring the plate on the full coat.");
        pending = window.setTimeout(() => {
          if (!stillCurrent()) return;
          const design = assembleMaskDesign(snapshot, gaps, place);
          setResult({ key: `${coatingKey(snapshot)}|${place}`, design });
          onOffsetRef.current(
            design.mask.halfAngleDeg.some((angle) => angle > 0.05) ? design.offsetIn : null,
          );
          setStatus("");
        }, 0);
        return;
      }
      const nextGap = state.queue[0];
      setStatus(
        nextGap != null
          ? `Trying a plate ${nextGap.toFixed(1)} in from the glass, ${place === "target" ? "near the target" : "near the part"}.`
          : "Checking the gaps next to the best plate.",
      );
      pending = window.setTimeout(() => {
        if (!stillCurrent() || !state) return;
        state = advanceMaskSearch(snapshot, state);
        step();
      }, 0);
    };
    pending = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(pending);
    };
  }, [runId]);

  const fresh = result?.key === resultKey ? result.design : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uniformity mask</CardTitle>
        <CardDescription>
          A stationary plate between the part and the target. It does not spin
          or orbit. Metal blocks sputter; open areas let it through. The search
          only trims thick radii. It cannot add material.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Where the plate sits</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={placement === "substrate" ? "default" : "outline"}
              onClick={() => setPlacement("substrate")}
            >
              Near the part
            </Button>
            <Button
              type="button"
              variant={placement === "target" ? "default" : "outline"}
              onClick={() => setPlacement("target")}
            >
              Near the target
            </Button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Near the part keeps the plate within 4 inches of the glass. Near the target keeps it within 4 inches of the target. The plate always stays between the two.
          </p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This proposal uses throw {coating.throwDistance.toFixed(1)} in, target{" "}
          {coating.sourceOffset.toFixed(1)} in from the sun center, gearing{" "}
          {coating.spinRatio.toFixed(1)}, sun angle {(coating.sunAngleDeg ?? 0).toFixed(0)}
          ° (that is also the planet angle to the plume), and target rock ±
          {(coating.targetOscillationDeg ?? 0).toFixed(1)}°. The optic is{" "}
          {coating.partDiameter.toFixed(1)} in across, orbiting at{" "}
          {coating.orbitRadius.toFixed(1)} in. Focal length{" "}
          {(coating.focalLength ?? 0).toFixed(1)} in. {describeOpticSag(coating.partDiameter, coating.focalLength ?? 0)}
        </p>
        {result ? <MaskResult coating={coating} design={result.design} /> : null}
        {status ? <p className="text-sm leading-relaxed">{status}</p> : null}
        {!status && !result ? (
          <p className="text-sm leading-relaxed">
            Choose where the plate sits, then design the mask.
          </p>
        ) : null}
        {!fresh && result && !status ? (
          <p className="text-sm leading-relaxed">
            The inputs changed. Design the mask again for this setup.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-fit"
          onClick={() => {
            setResult(null);
            setRunId((value) => value + 1);
          }}
        >
          Design the mask again
        </Button>
      </CardContent>
    </Card>
  );
}

function MaskResult({ coating, design }: { coating: CoatingInputs; design: MaskDesign }) {
  const winner = design.gaps.findIndex((gap) => Math.abs(gap.offsetIn - design.offsetIn) < 0.02);
  const winnerGap = winner >= 0 ? design.gaps[winner] : null;
  const previous = winner > 0 ? design.gaps[winner - 1] : null;
  const next = winner >= 0 && winner < design.gaps.length - 1 ? design.gaps[winner + 1] : null;
  const neighborsWorse =
    !!winnerGap &&
    (!previous || previous.plusMinusPercent >= winnerGap.plusMinusPercent - 1e-9) &&
    (!next || next.plusMinusPercent >= winnerGap.plusMinusPercent - 1e-9);
  const change = design.beforePlusMinusPercent - design.afterPlusMinusPercent;
  const outline = maskOutlinePoints(design.mask, 49);
  const high = opticHigh(coating.partDiameter, radiusFromFocalLength(coating.focalLength ?? 0));
  const lift = Number.isFinite(high) ? Math.max(0, high) : 0;
  const shortOfTarget = coating.throwDistance - design.offsetIn - lift;
  const place = design.placement === "target" ? "near the target" : "near the part";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-medium leading-snug text-foreground">
        The plate sits {design.offsetIn.toFixed(2)} inches from the glass
        {shortOfTarget > 0 ? `, ${shortOfTarget.toFixed(2)} inches short of the target` : ""}. This search looked {place}.
      </p>
      <p className="text-sm leading-relaxed">{design.shapeText}</p>
      <p className="text-sm leading-relaxed">
        {design.improved
          ? `Without the mask the coat is ±${formatUniformity(design.beforePlusMinusPercent)}%. With this plate it is ±${formatUniformity(design.afterPlusMinusPercent)}%.`
          : `No plate in this range beats the unmasked film. It stays ±${formatUniformity(design.beforePlusMinusPercent)}%.`}
        {design.improved && change < 0.05
          ? " That is a small change. The unmasked coat was already quite flat."
          : ""}
      </p>
      {previous || next ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {previous
            ? `At ${previous.offsetIn.toFixed(2)} in the coat is ±${formatUniformity(previous.plusMinusPercent)}%. `
            : ""}
          {next
            ? `At ${next.offsetIn.toFixed(2)} in the coat is ±${formatUniformity(next.plusMinusPercent)}%. `
            : ""}
          {neighborsWorse ? "Those neighbors are less even." : ""}
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Gaps tried, from the part toward the target:{" "}
        {design.gaps
          .map((gap) => `${gap.offsetIn.toFixed(2)} in → ±${formatUniformity(gap.plusMinusPercent)}%`)
          .join("; ")}
        .
      </p>
      <MaskComparePlot before={design.beforePoints} after={design.afterPoints} />
      <MaskDrawing
        points={outline}
        orbitRadius={coating.orbitRadius}
        partDiameter={coating.partDiameter}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-fit"
        onClick={() => downloadText("uniformity-mask.csv", maskOutlineCsv(design, coating))}
      >
        <Download />
        Download the mask outline
      </Button>
      <p className="text-sm leading-snug text-muted-foreground">
        A CSV file in inches: the gap, the inputs, and the cut edge. The origin
        is the sun center. Positive x points at the target.
      </p>
    </div>
  );
}

function MaskComparePlot({ before, after }: { before: RadialSample[]; after: RadialSample[] }) {
  const { ref, width } = useElementWidth(280);
  const height = width < 520 ? 220 : 260;
  const marginLeft = 44;
  const marginRight = 12;
  const marginTop = 12;
  const marginBottom = 32;
  const plotWidth = Math.max(1, width - marginLeft - marginRight);
  const plotHeight = Math.max(1, height - marginTop - marginBottom);
  const radii = before.map((point) => point.radius);
  const xMax = Math.max(1, ...radii);
  const values = [...before, ...after].flatMap((point) => [point.planetary]).filter((value) => Number.isFinite(value));
  let yMin = Math.min(0.98, ...values);
  let yMax = Math.max(1.02, ...values);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0.9;
    yMax = 1.1;
  }
  const pad = (yMax - yMin) * 0.12 || 0.01;
  yMin -= pad;
  yMax += pad;
  const xOf = (radius: number) => marginLeft + (radius / xMax) * plotWidth;
  const yOf = (value: number) => marginTop + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const pathFor = (points: RadialSample[]) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(point.radius).toFixed(2)} ${yOf(point.planetary).toFixed(2)}`)
      .join(" ");

  return (
    <div ref={ref} className="w-full min-w-0">
      <p className="mb-1 text-sm text-muted-foreground">
        Relative thickness from the center of the part to the edge. Each curve
        is set so its own center reads 1.00.
      </p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Relative thickness before and after the mask." className="block max-w-full">
        <path d={pathFor(before)} fill="none" stroke="#7d8b99" strokeWidth={2} />
        <path d={pathFor(after)} fill="none" stroke="#143a66" strokeWidth={2.5} />
        <text x={marginLeft} y={height - 8} fill="#526273" fontSize={12}>
          0
        </text>
        <text x={marginLeft + plotWidth - 28} y={height - 8} fill="#526273" fontSize={12}>
          {xMax.toFixed(1)} in
        </text>
      </svg>
      <ul className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 bg-[#7d8b99]" />
          Before the mask
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-6 bg-[#143a66]" />
          With the mask
        </li>
      </ul>
    </div>
  );
}

function MaskDrawing({
  points,
  orbitRadius,
  partDiameter,
}: {
  points: Array<{ x: number; y: number }>;
  orbitRadius: number;
  partDiameter: number;
}) {
  const { ref, width } = useElementWidth(280);
  const height = 280;
  const drawn = useMemo(() => {
    const partRadius = Math.max(0.5, partDiameter) / 2;
    const xs = [0, orbitRadius - partRadius, orbitRadius + partRadius, ...points.map((point) => point.x)];
    const ys = [partRadius, -partRadius, ...points.map((point) => point.y)];
    const minX = Math.min(...xs) - 0.6;
    const maxX = Math.max(...xs) + 0.6;
    const minY = Math.min(...ys) - 0.6;
    const maxY = Math.max(...ys) + 0.6;
    const scale = Math.min((width - 36) / Math.max(1, maxX - minX), (height - 36) / Math.max(1, maxY - minY));
    const toX = (x: number) => 18 + (x - minX) * scale;
    const toY = (y: number) => 18 + (maxY - y) * scale;
    const outline =
      points.length > 1
        ? `${points
            .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point.x).toFixed(2)} ${toY(point.y).toFixed(2)}`)
            .join(" ")} Z`
        : "";
    return { toX, toY, scale, outline, partRadius };
  }, [height, orbitRadius, partDiameter, points, width]);

  return (
    <div ref={ref} className="w-full min-w-0">
      <p className="mb-1 text-sm text-muted-foreground">
        The mask plane, looking down. The circle is the part, drawn where it
        passes nearest the target, so the finger can be compared with an{" "}
        {partDiameter.toFixed(1)} in disk. The sun center is the origin.
      </p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scale drawing of the mask outline and the part." className="block max-w-full">
        <circle cx={drawn.toX(0)} cy={drawn.toY(0)} r={3} fill="#526273" />
        <circle
          cx={drawn.toX(orbitRadius)}
          cy={drawn.toY(0)}
          r={Math.max(1, drawn.partRadius * drawn.scale)}
          fill="none"
          stroke="#143a66"
          strokeWidth={1.5}
        />
        {drawn.outline ? <path d={drawn.outline} fill="#143a6622" stroke="#143a66" strokeWidth={2} /> : null}
        <text x={drawn.toX(orbitRadius) + 6} y={drawn.toY(0) - drawn.partRadius * drawn.scale - 4} fill="#526273" fontSize={12}>
          Part
        </text>
      </svg>
    </div>
  );
}
