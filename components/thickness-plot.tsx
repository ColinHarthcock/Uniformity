"use client";

import { useElementWidth } from "@/components/use-element-width";
import type { RadialSample } from "@/lib/coating";

const PLANETARY = "#143a66";
const STATIONARY = "#7d8b99";

type ThicknessPlotProps = {
  points: RadialSample[];
};

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function ticks(min: number, max: number, count = 5): { step: number; values: number[] } {
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.ceil((min - step * 1e-6) / step) * step;
  const values: number[] = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    const rounded = Number(value.toFixed(6));
    if (rounded >= min - step * 1e-4 && rounded <= max + step * 1e-4) {
      values.push(rounded);
    }
  }
  return { step, values };
}

function formatTick(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return value.toFixed(decimals);
}

function px(value: number): number {
  return Math.round(value * 100) / 100;
}

function linePath(
  points: RadialSample[],
  xOf: (radius: number) => number,
  yOf: (value: number) => number,
  key: "planetary" | "stationary",
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${xOf(point.radius).toFixed(2)} ${yOf(point[key]).toFixed(2)}`;
    })
    .join(" ");
}

export function ThicknessPlot({ points }: ThicknessPlotProps) {
  const { ref, width } = useElementWidth(280);
  const height = width < 520 ? 250 : 320;
  const marginLeft = width < 420 ? 48 : 56;
  const marginRight = 12;
  const marginTop = 12;
  const marginBottom = 32;
  const plotWidth = Math.max(1, width - marginLeft - marginRight);
  const plotHeight = Math.max(1, height - marginTop - marginBottom);

  const finite = points.filter(
    (point) =>
      Number.isFinite(point.planetary) && Number.isFinite(point.stationary),
  );
  const radii = finite.map((point) => point.radius);
  const values = finite.flatMap((point) => [point.planetary, point.stationary]);
  const xMin = 0;
  let xMax = Math.max(1, ...radii, 0);
  let yMin = Math.min(1, ...values);
  let yMax = Math.max(1, ...values);
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0.8;
    yMax = 1.2;
  }
  if (yMax - yMin < 1e-4) {
    yMin -= 0.05;
    yMax += 0.05;
  }
  const yPad = (yMax - yMin) * 0.12;
  yMin -= yPad;
  yMax += yPad;
  if (xMax <= xMin) xMax = xMin + 1;

  const xTicks = ticks(xMin, xMax, width < 420 ? 4 : 5);
  const yTicks = ticks(yMin, yMax, 5);

  const xOf = (radius: number) =>
    px(marginLeft + ((radius - xMin) / (xMax - xMin)) * plotWidth);
  const yOf = (value: number) =>
    px(marginTop + ((yMax - value) / (yMax - yMin)) * plotHeight);

  return (
    <div ref={ref} className="w-full min-w-0">
      <ul className="mb-2 flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-7 rounded-full"
            style={{ backgroundColor: PLANETARY }}
            aria-hidden="true"
          />
          With the part orbiting and spinning
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block h-0 w-7 border-t-2 border-dashed"
            style={{ borderColor: STATIONARY }}
            aria-hidden="true"
          />
          If the part sat still under the target
        </li>
      </ul>
      <p className="mb-1 text-sm text-muted-foreground">
        Relative thickness (center = 1)
      </p>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Relative thickness from the center of the part to the edge. The solid blue curve is with the part orbiting and spinning. The dashed gray curve is if the part sat still under the target."
        className="block max-w-full"
      >
        {yTicks.values.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={marginLeft}
              x2={width - marginRight}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="#e2e8ef"
              strokeWidth={1}
            />
            <text
              x={marginLeft - 8}
              y={yOf(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#526273"
              fontSize={12}
            >
              {formatTick(tick, yTicks.step)}
            </text>
          </g>
        ))}
        {xTicks.values.map((tick) => (
          <text
            key={`x-${tick}`}
            x={xOf(tick)}
            y={height - 8}
            textAnchor="middle"
            fill="#526273"
            fontSize={12}
          >
            {formatTick(tick, xTicks.step)}
          </text>
        ))}
        <line
          x1={marginLeft}
          x2={marginLeft}
          y1={marginTop}
          y2={marginTop + plotHeight}
          stroke="#c5d0db"
          strokeWidth={1}
        />
        <line
          x1={marginLeft}
          x2={width - marginRight}
          y1={marginTop + plotHeight}
          y2={marginTop + plotHeight}
          stroke="#c5d0db"
          strokeWidth={1}
        />
        {finite.length > 1 ? (
          <>
            <path
              d={linePath(finite, xOf, yOf, "stationary")}
              fill="none"
              stroke={STATIONARY}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={linePath(finite, xOf, yOf, "planetary")}
              fill="none"
              stroke={PLANETARY}
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
      </svg>
      <p className="text-center text-sm text-muted-foreground">
        Distance from the center of the part (inches)
      </p>
    </div>
  );
}
