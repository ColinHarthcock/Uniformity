"use client";

import { useElementWidth } from "@/components/use-element-width";
import type { AngleUniformity } from "@/lib/coating";

const CURVE = "#143a66";
const GUIDE = "#7d8b99";

type AngleSweepPlotProps = {
  samples: AngleUniformity[];
  currentAngleDeg: number;
  bestAngleDeg: number;
};

function px(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatUniformity(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.1) return value.toFixed(3);
  return value.toFixed(2);
}

export function AngleSweepPlot({
  samples,
  currentAngleDeg,
  bestAngleDeg,
}: AngleSweepPlotProps) {
  const { ref, width } = useElementWidth(280);
  const height = width < 520 ? 220 : 260;
  const finite = samples.filter((sample) => Number.isFinite(sample.plusMinusPercent));
  if (finite.length < 2) {
    return <p className="text-sm text-muted-foreground">No angle curve yet.</p>;
  }

  const marginLeft = 44;
  const marginRight = 12;
  const marginTop = 12;
  const marginBottom = 36;
  const plotWidth = Math.max(1, width - marginLeft - marginRight);
  const plotHeight = Math.max(1, height - marginTop - marginBottom);
  const minAngle = finite[0]!.angleDeg;
  const maxAngle = finite[finite.length - 1]!.angleDeg;
  const maxPercent = Math.max(
    ...finite.map((sample) => sample.plusMinusPercent),
    0.5,
  );
  const yMax = maxPercent * 1.08;
  const xOf = (angle: number) =>
    px(marginLeft + ((angle - minAngle) / Math.max(1e-6, maxAngle - minAngle)) * plotWidth);
  const yOf = (percent: number) =>
    px(marginTop + ((yMax - percent) / yMax) * plotHeight);

  const path = finite
    .map((sample, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xOf(sample.angleDeg)} ${yOf(sample.plusMinusPercent)}`;
    })
    .join(" ");

  const guides = [
    { percent: 0.5, label: "±0.5%" },
    { percent: 0.25, label: "±0.25%" },
  ];
  const xTicks = [-10, -5, 0, 5, 10].filter(
    (tick) => tick >= minAngle - 0.1 && tick <= maxAngle + 0.1,
  );

  return (
    <div ref={ref} className="w-full min-w-0">
      <p className="mb-1 text-sm text-muted-foreground">
        Uniformity versus sun angle, the planets&apos; angle to the plume.
        The dashed lines are the masked Spector figures, ±0.5% and ±0.25%.
        Lower is flatter.
      </p>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Uniformity in plus or minus percent versus sun angle, the planets' angle to the plume. Lower is flatter."
        className="block max-w-full"
      >
        {guides.map((guide) => (
          <line
            key={guide.label}
            x1={marginLeft}
            x2={width - marginRight}
            y1={yOf(guide.percent)}
            y2={yOf(guide.percent)}
            stroke={GUIDE}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        ))}
        <line
          x1={xOf(currentAngleDeg)}
          x2={xOf(currentAngleDeg)}
          y1={marginTop}
          y2={height - marginBottom}
          stroke={CURVE}
          strokeOpacity={0.35}
          strokeWidth={1.5}
        />
        <path d={path} fill="none" stroke={CURVE} strokeWidth={2} />
        <circle cx={xOf(bestAngleDeg)} cy={yOf(
          finite.reduce((best, sample) =>
            Math.abs(sample.angleDeg - bestAngleDeg) < Math.abs(best.angleDeg - bestAngleDeg)
              ? sample
              : best,
          ).plusMinusPercent,
        )} r={4} fill={CURVE} />
        {xTicks.map((tick) => (
          <text
            key={tick}
            x={xOf(tick)}
            y={height - 16}
            textAnchor="middle"
            fill="#526273"
            fontSize={12}
          >
            {tick}°
          </text>
        ))}
        <text x={4} y={marginTop + 12} fill="#526273" fontSize={12}>
          ±%
        </text>
      </svg>
    </div>
  );
}
