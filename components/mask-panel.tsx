"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatUniformity } from "@/components/angle-sweep-plot";
import { useElementWidth } from "@/components/use-element-width";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeOpticSag, opticHighFromSag, type CoatingInputs, type RadialSample } from "@/lib/coating";
import {
  advanceMaskSearch,
  assembleMaskDesign,
  maskOutlineCsv,
  maskOutlinePoints,
  maskSearchDone,
  preferMaskScore,
  startMaskSearch,
  type MaskDesign,
  type MaskSearchState,
} from "@/lib/mask";

type MaskPanelProps = {
  coating: CoatingInputs;
  onOffset: (mm: number | null) => void;
};

function coatingKey(coating: CoatingInputs): string {
  return JSON.stringify({
    throwDistance: coating.throwDistance,
    sourceOffset: coating.sourceOffset,
    spinRatio: coating.spinRatio,
    sunAngleDeg: coating.sunAngleDeg ?? 0,
    targetOscillationDeg: coating.targetOscillationDeg ?? 0,
    partDiameter: coating.partDiameter,
    sag: coating.sag ?? 0,
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
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<{ key: string; design: MaskDesign } | null>(null);
  const cancelSearch = useRef(0);

  useEffect(() => {
    // Drop a finished design when the coat inputs change so the old
    // before-mask ±% cannot linger under a new convex/concave setting.
    setResult((current) => (current && current.key === key ? current : null));
  }, [key]);

  useEffect(() => {
    if (runId === 0) return;
    let cancelled = false;
    let pending = 0;
    let state: MaskSearchState | null = null;
    const token = ++cancelSearch.current;
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
          state = startMaskSearch(snapshot);
          step();
        }, 0);
        return;
      }
      if (maskSearchDone(state)) {
        const gaps = state.gaps.slice().sort((left, right) => left.offsetIn - right.offsetIn);
        setStatus("Scoring the plate on the full coat.");
        pending = window.setTimeout(() => {
          if (!stillCurrent()) return;
          const design = assembleMaskDesign(snapshot, gaps);
          setResult({ key: coatingKey(snapshot), design });
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
          ? `Trying a plate ${nextGap.toFixed(1)} mm from the glass, near the part.`
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

  const fresh = result?.key === key ? result.design : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uniformity mask</CardTitle>
        <CardDescription>
          A stationary plate near the part, between the glass and the target. It
          does not spin or orbit. Metal blocks sputter; open areas let it
          through. The search keeps the plate within 101.6 mm of the glass, aims
          for ±0.5% or better, then keeps the finger as small as it can so more
          of the coat rate survives. It only trims thick radii — it cannot add
          material.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This proposal uses throw {coating.throwDistance.toFixed(1)} mm, target{" "}
          {coating.sourceOffset.toFixed(1)} mm from the sun center, gearing{" "}
          {coating.spinRatio.toFixed(1)}, sun angle {(coating.sunAngleDeg ?? 0).toFixed(0)}
          ° (that is also the planet angle to the plume), and target rock ±
          {(coating.targetOscillationDeg ?? 0).toFixed(1)}°. The optic is{" "}
          {coating.partDiameter.toFixed(1)} mm across, orbiting at{" "}
          {coating.orbitRadius.toFixed(1)} mm. Sag{" "}
          {(coating.sag ?? 0).toFixed(1)} mm. {describeOpticSag(coating.partDiameter, coating.sag ?? 0)}
        </p>
        {fresh ? <MaskResult coating={coating} design={fresh} /> : null}
        {status ? <p className="text-sm leading-relaxed">{status}</p> : null}
        {!status && !fresh ? (
          <p className="text-sm leading-relaxed">
            {result
              ? "The inputs changed, including the optic curve. Design the mask again for this setup — convex and concave do not share the same unmasked ±%."
              : "Design the mask for this setup. The plate will sit near the part."}
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
  const winner = design.gaps.findIndex((gap) => Math.abs(gap.offsetIn - design.offsetIn) < 0.5);
  const winnerGap = winner >= 0 ? design.gaps[winner] : null;
  const previous = winner > 0 ? design.gaps[winner - 1] : null;
  const next = winner >= 0 && winner < design.gaps.length - 1 ? design.gaps[winner + 1] : null;
  const neighborsWorse =
    !!winnerGap &&
    (!previous || preferMaskScore(winnerGap, previous, design.bias)) &&
    (!next || preferMaskScore(winnerGap, next, design.bias));
  const change = design.beforePlusMinusPercent - design.afterPlusMinusPercent;
  const outline = maskOutlinePoints(design.mask, 49);
  const high = opticHighFromSag(coating.sag ?? 0);
  const lift = Number.isFinite(high) ? Math.max(0, high) : 0;
  const shortOfTarget = coating.throwDistance - design.offsetIn - lift;
  const edgeIndex = Math.max(0, design.beforePoints.length - 1);
  const centerBlocked = blockedFraction(design.beforePoints[0], design.afterPoints[0]);
  const edgeBlocked = blockedFraction(design.beforePoints[edgeIndex], design.afterPoints[edgeIndex]);
  const unmaskedEdge = design.beforePoints[edgeIndex]?.planetary ?? Number.NaN;
  const maskedEdge = design.afterPoints[edgeIndex]?.planetary ?? Number.NaN;
  const rimMoreOpen =
    design.improved &&
    edgeBlocked < centerBlocked - 1e-4 &&
    maskedEdge > unmaskedEdge;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-medium leading-snug text-foreground">
        The plate sits {design.offsetIn.toFixed(1)} mm from the glass
        {shortOfTarget > 0 ? `, ${shortOfTarget.toFixed(1)} mm short of the target` : ""}. Near the part.
      </p>
      <p className="text-sm leading-relaxed">{design.shapeText}</p>
      {rimMoreOpen ? (
        <p className="text-sm leading-relaxed">
          The edge is already the thin place, so the plate must trim the thick
          center — metal never adds coat. Over a full orbit it blocks{" "}
          {formatBlocked(centerBlocked)} of the coat at the center and only{" "}
          {formatBlocked(edgeBlocked)} at the rim
          {centerBlocked - edgeBlocked > 0.08
            ? ` — ${((centerBlocked - edgeBlocked) * 100).toFixed(0)} points more at the center`
            : ""}
          . Absolute flux lost at the center is higher than at the rim. The pear
          below is one finger: widest at the spin center (part center), tapering
          toward both rims — no pinch or figure-8 at the center.
        </p>
      ) : null}
      <p className="text-sm leading-relaxed">
        {design.improved
          ? `Without the mask the coat is ±${formatUniformity(design.beforePlusMinusPercent)}%. With this plate it is ±${formatUniformity(design.afterPlusMinusPercent)}%.`
          : `No plate in this range beats the unmasked film. It stays ±${formatUniformity(design.beforePlusMinusPercent)}%.`}
        {design.improved
          ? ` About ${(design.retainedFraction * 100).toFixed(0)}% of the unmasked coat rate still reaches the part.`
          : ""}
        {design.improved && design.meetsTarget
          ? " That meets the ±0.5% aim with the smallest finger the search found."
          : ""}
        {design.improved && !design.meetsTarget
          ? " It does not reach ±0.5%, so the search kept the flattest plate it could while limiting how much rate it throws away."
          : ""}
        {design.improved && change < 0.05
          ? " That is a small change. The unmasked coat was already quite flat."
          : ""}
      </p>
      {previous || next ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {previous
            ? `At ${previous.offsetIn.toFixed(1)} mm the coat is ±${formatUniformity(previous.plusMinusPercent)}%. `
            : ""}
          {next
            ? `At ${next.offsetIn.toFixed(1)} mm the coat is ±${formatUniformity(next.plusMinusPercent)}%. `
            : ""}
          {neighborsWorse ? "Those neighbors are less even." : ""}
        </p>
      ) : null}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Gaps tried, from the part toward the target:{" "}
        {design.gaps
          .map(
            (gap) =>
              `${gap.offsetIn.toFixed(1)} mm → ±${formatUniformity(gap.plusMinusPercent)}% at ${(gap.retainedFraction * 100).toFixed(0)}% rate`,
          )
          .join("; ")}
        .
      </p>
      <MaskComparePlot
        before={design.beforePoints}
        after={design.afterPoints}
        rimMoreOpen={rimMoreOpen}
      />
      <MaskDrawing
        points={outline}
        orbitRadius={coating.orbitRadius}
        partDiameter={coating.partDiameter}
        rimMoreOpen={rimMoreOpen}
        centerBlocked={centerBlocked}
        edgeBlocked={edgeBlocked}
        offsetIn={design.offsetIn}
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
        A CSV file in millimeters: the gap, the inputs, and the cut edge. x is
        sun-radius toward the target; ±y is half the metal width at that
        sun-radius.
      </p>
    </div>
  );
}

function blockedFraction(before: RadialSample | undefined, after: RadialSample | undefined): number {
  const flux = before?.planetaryFlux ?? 0;
  if (!(flux > 0) || !after) return Number.NaN;
  return 1 - after.planetaryFlux / flux;
}

function formatBlocked(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function MaskComparePlot({
  before,
  after,
  rimMoreOpen,
}: {
  before: RadialSample[];
  after: RadialSample[];
  rimMoreOpen: boolean;
}) {
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
        {rimMoreOpen
          ? " The gray curve is already thinner at the edge. The mask takes more off the center than off that edge, so the blue curve finishes closer to 1."
          : ""}
      </p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Relative thickness before and after the mask." className="block max-w-full">
        <path d={pathFor(before)} fill="none" stroke="#7d8b99" strokeWidth={2} />
        <path d={pathFor(after)} fill="none" stroke="#143a66" strokeWidth={2.5} />
        <text x={marginLeft} y={height - 8} fill="#526273" fontSize={12}>
          0
        </text>
        <text x={marginLeft + plotWidth - 28} y={height - 8} fill="#526273" fontSize={12}>
          {xMax.toFixed(1)} mm
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
  rimMoreOpen,
  centerBlocked,
  edgeBlocked,
  offsetIn,
}: {
  points: Array<{ x: number; y: number }>;
  orbitRadius: number;
  partDiameter: number;
  rimMoreOpen: boolean;
  centerBlocked: number;
  edgeBlocked: number;
  offsetIn: number;
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
    let metal = points[0];
    for (const point of points) {
      if (metal && Math.abs(point.y) > Math.abs(metal.y)) metal = point;
    }
    return { toX, toY, scale, outline, partRadius, metal };

  }, [height, orbitRadius, partDiameter, points, width]);

  return (
    <div ref={ref} className="w-full min-w-0">
      <p className="mb-1 text-sm text-muted-foreground">
        Mask outline: distance from the sun center runs left→right; the shaded
        height is the metal chord width at that sun-radius (one contiguous
        finger). The circle is the glass at its closest pass to the target. The
        plate sits {offsetIn.toFixed(1)} mm above the glass, toward the target —
        not metal painted on the part.
      </p>
      {rimMoreOpen ? (
        <p className="mb-1 text-sm text-muted-foreground">
          Center-thick coat (convex / closer at center): the metal is
          pear-shaped — widest near the part center, tapering toward both rims
          — so sputter to the thick center is blocked more than sputter to the
          thin rim. Over a full orbit the plate blocks{" "}
          {formatBlocked(centerBlocked)} at the center and{" "}
          {formatBlocked(edgeBlocked)} at the rim. The blue curve looks higher
          at the edge only because each curve is rescaled so its own center
          reads 1.00.
        </p>
      ) : (
        <p className="mb-1 text-sm text-muted-foreground">
          Wide metal toward the target does not mean the thin rim is being
          trimmed on purpose. Rays to different radii on the spinning part cross
          this raised plate at different places, so the finger shape is chosen
          from that average, not from overlaying metal on the thick or thin look
          of this one snapshot.
        </p>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scale drawing of the mask outline and the part. Wide metal is the center-trim path when the coat is thick in the middle." className="block max-w-full">
        <circle cx={drawn.toX(0)} cy={drawn.toY(0)} r={3} fill="#526273" />
        <text x={drawn.toX(0) + 6} y={drawn.toY(0) - 6} fill="#526273" fontSize={11}>
          Sun
        </text>
        <circle
          cx={drawn.toX(orbitRadius)}
          cy={drawn.toY(0)}
          r={Math.max(1, drawn.partRadius * drawn.scale)}
          fill="none"
          stroke="#143a66"
          strokeWidth={1.5}
        />
        <circle
          cx={drawn.toX(orbitRadius)}
          cy={drawn.toY(0)}
          r={3}
          fill="#143a66"
        />
        <text
          x={drawn.toX(orbitRadius) + 6}
          y={drawn.toY(0) + 14}
          fill="#526273"
          fontSize={11}
        >
          Part center
        </text>
        {drawn.outline ? <path d={drawn.outline} fill="#143a6622" stroke="#143a66" strokeWidth={2} /> : null}
        {drawn.metal ? (
          <text
            x={drawn.toX(rimMoreOpen ? orbitRadius : drawn.metal.x)}
            y={drawn.toY(drawn.metal.y) - 6}
            textAnchor="middle"
            fill="#143a66"
            fontSize={12}
          >
            {rimMoreOpen ? "Pear: wide at center" : "Metal"}
          </text>
        ) : null}
        {rimMoreOpen ? (
          <text
            x={drawn.toX(orbitRadius + drawn.partRadius)}
            y={drawn.toY(0) - drawn.partRadius * drawn.scale - 4}
            textAnchor="middle"
            fill="#526273"
            fontSize={11}
          >
            Tapers to rim
          </text>
        ) : (
          <text x={drawn.toX(orbitRadius) + 6} y={drawn.toY(0) - drawn.partRadius * drawn.scale - 4} fill="#526273" fontSize={12}>
            Part
          </text>
        )}
        <text
          x={drawn.toX(orbitRadius + drawn.partRadius)}
          y={drawn.toY(0) + drawn.partRadius * drawn.scale + 14}
          textAnchor="middle"
          fill="#526273"
          fontSize={11}
        >
          Toward target →
        </text>
      </svg>
    </div>
  );
}
