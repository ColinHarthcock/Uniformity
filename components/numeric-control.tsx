"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export function roundTenth(value: number): number {
  return Number(value.toFixed(1));
}

function stepDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 1;
  const text = step.toString();
  if (text.includes("e-") || text.includes("E-")) {
    const exp = Number(text.split(/e-/i)[1]);
    return Number.isFinite(exp) ? Math.min(6, Math.max(0, exp)) : 1;
  }
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : Math.min(6, text.length - dot - 1);
}

export function roundToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  const decimals = stepDecimals(step);
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimals));
}

/** Digits needed so values like 304.8 mm are not shown as 305 when step is 1. */
function displayDecimals(value: number, step: number): number {
  const fromStep = stepDecimals(step);
  if (!Number.isFinite(value)) return fromStep;
  const text = value.toString();
  if (text.includes("e") || text.includes("E")) return Math.max(fromStep, 1);
  const dot = text.indexOf(".");
  const fromValue = dot < 0 ? 0 : Math.min(6, text.length - dot - 1);
  return Math.max(fromStep, fromValue);
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
  const decimals = displayDecimals(value, step);
  const format = (next: number) => next.toFixed(displayDecimals(next, step));
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);
  const hintId = `${id}-hint`;

  useEffect(() => {
    if (!focused.current) {
      setText(format(value));
    }
  }, [value, step]);

  const commit = (next: number) => {
    onChange(roundToStep(clamp(next, min, max), step));
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
                setText(format(value));
                return;
              }
              const next = roundToStep(clamp(parsed, min, max), step);
              onChange(next);
              setText(format(next));
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.currentTarget.blur();
            }}
            onChange={(event) => {
              const nextText = event.target.value;
              setText(nextText);
              const parsed = Number(nextText);
              if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
              onChange(roundToStep(parsed, step));
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
