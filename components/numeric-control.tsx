"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function roundTenth(value: number): number {
  return Number(value.toFixed(1));
}

type NumericControlProps = {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  action?: ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function NumericControl({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  action,
}: NumericControlProps) {
  const [text, setText] = useState(() => value.toFixed(1));
  const focused = useRef(false);
  const hintId = `${id}-hint`;

  useEffect(() => {
    if (!focused.current) {
      setText(value.toFixed(1));
    }
  }, [value]);

  const commit = (next: number) => {
    onChange(roundTenth(clamp(next, min, max)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Label htmlFor={id} className="leading-snug">
          {label}
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={text}
            autoComplete="off"
            aria-describedby={hintId}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              const parsed = Number(text);
              if (!Number.isFinite(parsed)) {
                setText(value.toFixed(1));
                return;
              }
              const next = roundTenth(clamp(parsed, min, max));
              onChange(next);
              setText(next.toFixed(1));
            }}
            onChange={(event) => {
              const nextText = event.target.value;
              setText(nextText);
              const parsed = Number(nextText);
              if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
              onChange(parsed);
            }}
            className="h-9 w-[5.5rem] text-right tabular-nums"
          />
          {suffix ? (
            <span className="w-12 shrink-0 text-sm text-muted-foreground">{suffix}</span>
          ) : (
            <span className="w-12 shrink-0" />
          )}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(next) => {
          const raw = typeof next === "number" ? next : next[0];
          if (typeof raw !== "number" || Number.isNaN(raw)) return;
          commit(raw);
        }}
      />
      <p id={hintId} className="text-sm leading-snug text-muted-foreground">
        {hint}
      </p>
      {action}
    </div>
  );
}
