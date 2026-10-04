"use client";

import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANET_AOI_LIMIT_DEG } from "@/lib/coating";

type PlaySlidersProps = {
  distanceIn: number;
  onDistance: (inches: number) => void;
  gearing: number;
  onGearing: (turns: number) => void;
  sunAngleDeg: number;
  onSunAngle: (degrees: number) => void;
  oscillationDeg: number;
  onOscillation: (degrees: number) => void;
};

function readSlider(next: number | readonly number[]): number | null {
  const raw = typeof next === "number" ? next : next[0];
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return raw;
}

function SliderRow({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  minLabel,
  maxLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="text-lg font-semibold tabular-nums text-primary">{display}</span>
      </div>
      <Slider
        id={id}
        size="lg"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(next) => {
          const raw = readSlider(next);
          if (raw == null) return;
          onChange(raw);
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function PlaySliders({
  distanceIn,
  onDistance,
  gearing,
  onGearing,
  sunAngleDeg,
  onSunAngle,
  oscillationDeg,
  onOscillation,
}: PlaySlidersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drag these</CardTitle>
        <CardDescription>
          The planets are attached to the sun, so the sun angle is their angle
          to the sputtered plume. They keep circling. 0° is square to a
          downward beam. Positive drops the side under the target. The fixture
          stops at ±{PLANET_AOI_LIMIT_DEG}°.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SliderRow
          id="slider-distance"
          label="Distance from sun center"
          value={distanceIn}
          display={`${distanceIn.toFixed(1)} in`}
          min={0}
          max={24}
          step={0.1}
          minLabel="0 in"
          maxLabel="24 in"
          onChange={onDistance}
        />
        <SliderRow
          id="slider-gearing"
          label="Gearing"
          value={gearing}
          display={gearing.toFixed(1)}
          min={0}
          max={40}
          step={0.1}
          minLabel="0"
          maxLabel="40"
          onChange={onGearing}
        />
        <SliderRow
          id="slider-sun-angle"
          label="Sun angle"
          value={sunAngleDeg}
          display={`${sunAngleDeg > 0 ? "+" : ""}${Math.round(sunAngleDeg)}°`}
          min={-PLANET_AOI_LIMIT_DEG}
          max={PLANET_AOI_LIMIT_DEG}
          step={1}
          minLabel={`−${PLANET_AOI_LIMIT_DEG}°`}
          maxLabel={`+${PLANET_AOI_LIMIT_DEG}°`}
          onChange={onSunAngle}
        />
        <SliderRow
          id="slider-oscillation"
          label="Target oscillation"
          value={oscillationDeg}
          display={`±${oscillationDeg.toFixed(1)}°`}
          min={0}
          max={20}
          step={0.5}
          minLabel="Still"
          maxLabel="±20°"
          onChange={onOscillation}
        />
      </CardContent>
    </Card>
  );
}
