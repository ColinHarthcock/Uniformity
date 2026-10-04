"use client";

import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AngleSweepPlot, formatUniformity } from "@/components/angle-sweep-plot";
import { ChamberDiagram } from "@/components/chamber-diagram";
import { MaskPanel } from "@/components/mask-panel";
import { PlaySliders } from "@/components/play-sliders";
import { NumericControl, roundTenth } from "@/components/numeric-control";
import { ThicknessPlot } from "@/components/thickness-plot";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_COATING,
  METHOD_SHARPNESS,
  METHOD_TARGET_DIAMETER,
  gearMeshOrbitRadius,
  gearSpinRatio,
  describeOpticSag,
  erosionEllipse,
  PLANET_AOI_LIMIT_DEG,
  TARGET_OSCILLATION_DEG,
  plateOrbitRadius,
  profileToCsv,
  sourcePassesOverPart,
  startPlanetAngleSweep,
  thicknessProfile,
  type CoatingMethod,
  type PlanetAngleSweep,
  type ThicknessProfile,
} from "@/lib/coating";

const methodItems = [
  { value: "ibs" as const, label: "Ion-beam sputtering" },
  { value: "ebeam" as const, label: "Electron-beam" },
];

function formatAngle(angleDeg: number): string {
  const rounded = Math.round(angleDeg * 10) / 10;
  const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${text}°`;
}

function downloadProfile(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "thickness-profile.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CoatingApp() {
  const [method, setMethod] = useState<CoatingMethod>(DEFAULT_COATING.method);
  const [throwDistance, setThrowDistance] = useState(DEFAULT_COATING.throwDistance);
  const [sharpness, setSharpness] = useState<number>(DEFAULT_COATING.sharpness);
  const [partDiameter, setPartDiameter] = useState(DEFAULT_COATING.partDiameter);
  const [planetDiameter, setPlanetDiameter] = useState(DEFAULT_COATING.planetDiameter);
  const [sunDiameter, setSunDiameter] = useState(DEFAULT_COATING.sunDiameter);
  const [orbitRadius, setOrbitRadius] = useState(DEFAULT_COATING.orbitRadius);
  const [orbitManual, setOrbitManual] = useState(false);
  const [spinRatio, setSpinRatio] = useState(DEFAULT_COATING.spinRatio);
  const [spinManual, setSpinManual] = useState(true);
  const [sourceOffset, setSourceOffset] = useState(DEFAULT_COATING.sourceOffset);
  const [offsetManual, setOffsetManual] = useState(true);
  const [targetDiameter, setTargetDiameter] = useState<number>(
    DEFAULT_COATING.targetDiameter,
  );
  const [targetTiltDeg, setTargetTiltDeg] = useState(DEFAULT_COATING.targetTiltDeg);
  const [targetOscillationDeg, setTargetOscillationDeg] = useState(
    DEFAULT_COATING.targetOscillationDeg,
  );
  const [sunAngleDeg, setSunAngleDeg] = useState(DEFAULT_COATING.sunAngleDeg);
  const [focalLength, setFocalLength] = useState(DEFAULT_COATING.focalLength);
  const [maskOffsetIn, setMaskOffsetIn] = useState<number | null>(null);
  const onMaskOffset = useCallback((inches: number | null) => {
    setMaskOffsetIn(inches);
  }, []);

  const beamSpot = erosionEllipse(targetDiameter);
  const plateOrbit = roundTenth(plateOrbitRadius(sunDiameter, planetDiameter));
  const outsideMesh = roundTenth(gearMeshOrbitRadius(sunDiameter, planetDiameter));
  const meshSpin = roundTenth(gearSpinRatio(sunDiameter, planetDiameter));
  const orbitMax = Math.max(40, orbitRadius, plateOrbit, outsideMesh);
  const spinMax = Math.max(40, spinRatio, meshSpin);

  const liveCoating = useMemo(
    () => ({
      throwDistance,
      sharpness,
      partDiameter,
      orbitRadius,
      spinRatio,
      sourceOffset,
      targetDiameter,
      targetTiltDeg,
      targetOscillationDeg,
      sunAngleDeg,
      focalLength,
    }),
    [
      throwDistance,
      sharpness,
      partDiameter,
      orbitRadius,
      spinRatio,
      sourceOffset,
      targetDiameter,
      targetTiltDeg,
      targetOscillationDeg,
      sunAngleDeg,
      focalLength,
    ],
  );
  const [settledCoating, setSettledCoating] = useState(liveCoating);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledCoating(liveCoating), 120);
    return () => window.clearTimeout(timer);
  }, [liveCoating]);

  const profileKey = JSON.stringify(settledCoating);
  const [profileState, setProfileState] = useState<{
    key: string;
    profile: ThicknessProfile;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const profile = thicknessProfile(settledCoating);
      if (!cancelled) setProfileState({ key: profileKey, profile });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settledCoating, profileKey]);
  const profile = profileState?.key === profileKey ? profileState.profile : null;
  const shownProfile = profile ?? profileState?.profile ?? null;

  const sweepInput = useMemo(
    () => ({
      throwDistance: settledCoating.throwDistance,
      sharpness: settledCoating.sharpness,
      partDiameter: settledCoating.partDiameter,
      orbitRadius: settledCoating.orbitRadius,
      spinRatio: settledCoating.spinRatio,
      sourceOffset: settledCoating.sourceOffset,
      targetDiameter: settledCoating.targetDiameter,
      targetTiltDeg: settledCoating.targetTiltDeg,
      targetOscillationDeg: settledCoating.targetOscillationDeg,
      focalLength: settledCoating.focalLength,
    }),
    [settledCoating],
  );
  const [sweepState, setSweepState] = useState<{
    key: string;
    sweep: PlanetAngleSweep;
  } | null>(null);
  const sweepKey = JSON.stringify(sweepInput);
  const [sweepWorking, setSweepWorking] = useState(false);
  const [sweepNote, setSweepNote] = useState("");
  const sweepAbort = useRef(0);
  useEffect(() => {
    sweepAbort.current += 1;
    setSweepWorking(false);
    setSweepNote("");
  }, [sweepKey]);
  const sweep = sweepState?.key === sweepKey ? sweepState.sweep : null;

  function recalculateUniformity() {
    const token = sweepAbort.current + 1;
    sweepAbort.current = token;
    const input = sweepInput;
    const key = sweepKey;
    setSweepWorking(true);
    setSweepNote("Working out uniformity versus the angle to the plume.");
    const job = startPlanetAngleSweep(input);
    const step = () => {
      if (sweepAbort.current !== token) return;
      const started = performance.now();
      while (!job.done && performance.now() - started < 32) job.step();
      if (sweepAbort.current !== token) return;
      if (job.done && job.result) {
        setSweepState({ key, sweep: job.result });
        setSweepWorking(false);
        setSweepNote("");
        return;
      }
      setSweepNote(
        `Working out uniformity versus the angle to the plume. ${job.completed} angles done.`,
      );
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  }

  const planetaryText =
    shownProfile && Number.isFinite(shownProfile.planetaryPlusMinusPercent)
      ? formatUniformity(shownProfile.planetaryPlusMinusPercent)
      : null;
  const fullSwingText =
    shownProfile && Number.isFinite(shownProfile.planetaryVariationPercent)
      ? formatUniformity(shownProfile.planetaryVariationPercent)
      : null;
  const stationaryText =
    shownProfile && Number.isFinite(shownProfile.stationaryPlusMinusPercent)
      ? formatUniformity(shownProfile.stationaryPlusMinusPercent)
      : null;
  const sourceOverPart = sourcePassesOverPart(
    orbitRadius,
    sourceOffset,
    partDiameter,
  );

  function applyDerivedOrbit(nextOrbit: number) {
    setOrbitRadius(nextOrbit);
    if (!offsetManual) setSourceOffset(nextOrbit);
  }

  function updateSun(next: number) {
    setSunDiameter(next);
    if (!orbitManual) {
      applyDerivedOrbit(roundTenth(plateOrbitRadius(next, planetDiameter)));
    }
    if (!spinManual) {
      setSpinRatio(roundTenth(gearSpinRatio(next, planetDiameter)));
    }
  }

  function updatePlanet(next: number) {
    setPlanetDiameter(next);
    if (!orbitManual) {
      applyDerivedOrbit(roundTenth(plateOrbitRadius(sunDiameter, next)));
    }
    if (!spinManual) {
      setSpinRatio(roundTenth(gearSpinRatio(sunDiameter, next)));
    }
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="h-1.5 bg-primary" aria-hidden="true" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        <header className="max-w-3xl">
          <p className="text-sm font-medium text-primary">Planetary rotation</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Coating thickness from center to edge
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Set the coating method, the chamber, and the optic curve, then
            read how thick the coating is from the center out to the edge.
            A focal length of 0 is a flat optic. The mask below is
            designed for whatever curve is set.
          </p>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Setup</CardTitle>
              <CardDescription>Lengths are in inches.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label id="coating-method">Coating method</Label>
                <div className="flex flex-col gap-2" role="group" aria-labelledby="coating-method">
                  {methodItems.map((item) => (
                    <Button
                      key={item.value}
                      type="button"
                      variant={method === item.value ? "default" : "outline"}
                      className="w-full justify-start"
                      aria-pressed={method === item.value}
                      onClick={() => {
                        setMethod(item.value);
                        setSharpness(METHOD_SHARPNESS[item.value]);
                        setTargetDiameter(METHOD_TARGET_DIAMETER[item.value]);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <p id="coating-method-hint" className="text-sm leading-snug text-muted-foreground">
                  Ion-beam sputtering keeps a 16 cm flat-top beam hitting the target at 45°, with cosine emission from that elliptical spot. Electron-beam is a small melt pool, a point where the target sits, not that beam and not the ellipse. Switching sets the sharpness and the source size back to that method. Sharpness can still be edited afterward.
                </p>
              </div>

              <NumericControl
                id="throw-distance"
                label="Throw distance"
                hint="Distance from the target down to the flat part. Spector does not publish this distance. A still part under the target gets more even as this grows, but the orbiting part can get worse for a while, because the target stays put sideways and a longer throw puts the planet path in a different part of the plume."
                value={throwDistance}
                min={2}
                max={36}
                step={0.1}
                suffix="in"
                onChange={setThrowDistance}
              />
              <NumericControl
                id="plume-sharpness"
                label="Plume sharpness"
                hint="1 is an even spray, the usual sputter pattern. Higher numbers bunch the spray along the direction the target faces. Ion-beam starts at 1. Electron-beam starts at 2."
                value={sharpness}
                min={0}
                max={30}
                step={0.1}
                onChange={setSharpness}
              />
              <NumericControl
                id="target-width"
                label={method === "ibs" ? "Ion beam diameter" : "Melt pool"}
                hint={
                  method === "ibs"
                    ? `Diameter of the ion beam, not the sputtered spot. Starts at 6.3 in, the published 16 cm source. The beam is taken as flat through the inner three-quarters of its radius, then it falls smoothly to zero at the edge. That shape is a stand-in, not a measured Spector curve. At 45° to the target it paints an ellipse ${(beamSpot.longRadius * 2).toFixed(1)} in by ${(beamSpot.shortRadius * 2).toFixed(1)} in. The long axis points along the sun radius.`
                    : "Electron-beam starts at 0, a point, because the melted pool is small. Switching method resets this."
                }
                value={targetDiameter}
                min={0}
                max={20}
                step={0.1}
                suffix="in"
                onChange={setTargetDiameter}
              />
              <NumericControl
                id="target-tilt"
                label="Target tilt"
                hint="0° means the target faces straight down at the parts. The 45° figure is the ion beam hitting the target, which sets the ellipse. It is not this tilt."
                value={targetTiltDeg}
                min={-45}
                max={45}
                step={1}
                suffix="°"
                onChange={setTargetTiltDeg}
              />
              <NumericControl
                id="target-oscillation"
                label="Target oscillation"
                hint={`The target rocks this far either side of the target tilt while the part turns. Starts at ±${TARGET_OSCILLATION_DEG}° angle of incidence. The ion gun stays put, so the beam’s angle on the target swings by the same amount around 45°. Equal time at each angle. 0° holds the target still.`}
                value={targetOscillationDeg}
                min={0}
                max={20}
                step={0.5}
                suffix="°"
                onChange={setTargetOscillationDeg}
              />
              <Separator />

              <NumericControl
                id="part-diameter"
                label="Optic diameter"
                hint="Diameter of the optic, centered on the planet. Sag is figured from this size and the focal length."
                value={partDiameter}
                min={1}
                max={24}
                step={0.1}
                suffix="in"
                onChange={setPartDiameter}
              />
              <NumericControl
                id="focal-length"
                label="Focal length"
                hint="0 is flat, sag 0. Positive is converging: the surface is hollow toward the target, so the center is farther from the target than the rim. Negative is diverging: the surface bulges toward the target, so the center is closer. Focal length is half the radius, and the sign above is which way the surface bends. The steepest surface that still covers the optic is a hemisphere, so the shortest focal length is a quarter of the diameter. For an 8 in optic that is 2 in, with 4 in of sag. A focal length of 1 in cannot reach that rim."
                value={focalLength}
                min={-80}
                max={80}
                step={0.1}
                suffix="in"
                onChange={setFocalLength}
              />
              <p className="text-sm leading-snug text-foreground">{describeOpticSag(partDiameter, focalLength)}</p>
              <NumericControl
                id="planet-diameter"
                label="Planet diameter"
                hint="Diameter of the planet that carries the part around the chamber."
                value={planetDiameter}
                min={1}
                max={24}
                step={0.1}
                suffix="in"
                onChange={updatePlanet}
              />
              <NumericControl
                id="sun-diameter"
                label="Sun diameter"
                hint="Diameter of the plate the planets sit on."
                value={sunDiameter}
                min={4}
                max={48}
                step={0.1}
                suffix="in"
                onChange={updateSun}
              />
              <NumericControl
                id="orbit-radius"
                label="Orbit radius"
                hint={
                  orbitManual
                    ? "Distance from the sun axis to the planet axis. Your number stays put when the plate sizes change."
                    : "Distance from the sun axis to the planet axis. Set to (sun − planet) / 2 so the planet sits on the plate. Gears that mesh on the outside would sit farther out."
                }
                value={orbitRadius}
                min={0}
                max={orbitMax}
                step={0.1}
                suffix="in"
                onChange={(next) => {
                  setOrbitManual(true);
                  applyDerivedOrbit(next);
                }}
                action={
                  orbitManual ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start px-0"
                      onClick={() => {
                        setOrbitManual(false);
                        applyDerivedOrbit(plateOrbit);
                      }}
                    >
                      Sit the planet on the plate ({plateOrbit.toFixed(1)} in)
                    </Button>
                  ) : null
                }
              />
              <NumericControl
                id="spins-per-orbit"
                label="Sun-to-planet gearing"
                hint={
                  spinManual
                    ? `How many times the planet turns for each trip around the sun. Starts at 20. Plate diameters would give ${meshSpin.toFixed(1)} if the teeth matched those sizes.`
                    : "Set from the sun and planet plate diameters. Tooth counts do not have to match those sizes."
                }
                value={spinRatio}
                min={0}
                max={spinMax}
                step={0.1}
                suffix="turns"
                onChange={(next) => {
                  setSpinManual(true);
                  setSpinRatio(next);
                }}
                action={
                  spinManual ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start px-0"
                      onClick={() => {
                        setSpinManual(false);
                        setSpinRatio(meshSpin);
                      }}
                    >
                      Use the plate sizes ({meshSpin.toFixed(1)} turns)
                    </Button>
                  ) : null
                }
              />

              <Separator />

              <NumericControl
                id="source-offset"
                label="Distance from sun center"
                hint={
                  offsetManual
                    ? "How far the target sits from the center of the sun plane. Starts at 12 in, the Hf target. The throw is the height straight down to the parts, also 12 in."
                    : "Kept equal to the orbit, so the target hangs over the planet’s path."
                }
                value={sourceOffset}
                min={-30}
                max={30}
                step={0.1}
                suffix="in"
                onChange={(next) => {
                  setOffsetManual(true);
                  setSourceOffset(next);
                }}
                action={
                  offsetManual ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start px-0"
                      onClick={() => {
                        setOffsetManual(false);
                        setSourceOffset(orbitRadius);
                      }}
                    >
                      Put the target over the path ({orbitRadius.toFixed(1)} in)
                    </Button>
                  ) : null
                }
              />
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <PlaySliders
              distanceIn={sourceOffset}
              onDistance={(inches) => {
                setOffsetManual(true);
                setSourceOffset(inches);
              }}
              gearing={spinRatio}
              onGearing={(turns) => {
                setSpinManual(true);
                setSpinRatio(turns);
              }}
              sunAngleDeg={sunAngleDeg}
              onSunAngle={setSunAngleDeg}
              oscillationDeg={targetOscillationDeg}
              onOscillation={setTargetOscillationDeg}
            />
            <Card>
              <CardHeader>
                <CardTitle>Thickness across the part</CardTitle>
                <CardDescription>
                  Both curves are set so the center reads 1.00, so you can
                  compare the shape. They do not show which setup deposits more
                  material overall.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-primary tabular-nums sm:text-5xl">
                    {planetaryText ? `±${planetaryText}%` : "—"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed sm:text-base">
                    {planetaryText
                      ? `The coating stays within ±${planetaryText}% of the average, from thinnest to thickest.`
                      : "Enter a throw distance greater than zero."}
                  </p>
                  {fullSwingText ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      The full swing from thinnest to thickest is {fullSwingText}%.
                    </p>
                  ) : null}
                  {stationaryText ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      If the part sat still under the target, it would stay
                      within ±{stationaryText}%.
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Spector quotes ±0.5% and ±0.25% with uniformity masks. This
                    number has no mask. The mask card below trims the thick parts.
                    {focalLength !== 0 ? ` ${describeOpticSag(partDiameter, focalLength)}` : ""}
                  </p>
                  {!profile ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Updating the coat for this setup.
                    </p>
                  ) : null}
                  {sweep ? (
                    <p className="mt-2 text-sm leading-relaxed">
                      Best inside ±{PLANET_AOI_LIMIT_DEG}° is ±{formatUniformity(sweep.best.plusMinusPercent)}%
                      at {formatAngle(sweep.best.angleDeg)}.
                      {sweep.best.angleDeg > 0.5
                        ? " That drops the side under the target."
                        : sweep.best.angleDeg < -0.5
                          ? " That raises the side under the target."
                          : " The planets are square to the beam."}
                      {Math.abs(Math.abs(sweep.best.angleDeg) - PLANET_AOI_LIMIT_DEG) < 0.2
                        ? " The curve is still getting flatter at that stop."
                        : ""}
                      {sweep.underHalfPercent
                        ? ` Under ±0.5% from ${formatAngle(sweep.underHalfPercent.fromDeg)} to ${formatAngle(sweep.underHalfPercent.toDeg)}.`
                        : " No angle in the sweep reaches ±0.5%."}
                      {sweep.underQuarterPercent
                        ? ` Under ±0.25% from ${formatAngle(sweep.underQuarterPercent.fromDeg)} to ${formatAngle(sweep.underQuarterPercent.toDeg)}.`
                        : " No angle in the sweep reaches ±0.25%."}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {sweepNote ||
                        (sweepState
                          ? "The inputs changed. Recalculate uniformity for this setup."
                          : "This ±% is the sun angle set above. Recalculate uniformity to compare the other angles to the plume.")}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full sm:w-fit"
                    disabled={sweepWorking}
                    onClick={recalculateUniformity}
                  >
                    Recalculate uniformity
                  </Button>
                  {sourceOverPart ? null : (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      The target does not pass over the part.
                    </p>
                  )}
                </div>
                {shownProfile ? <ThicknessPlot points={shownProfile.points} /> : null}
                {sweep ? (
                  <AngleSweepPlot
                    samples={sweep.samples}
                    currentAngleDeg={sunAngleDeg}
                    bestAngleDeg={sweep.best.angleDeg}
                  />
                ) : null}
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-fit"
                    disabled={!shownProfile}
                    onClick={() => {
                      if (!shownProfile) return;
                      downloadProfile(profileToCsv(shownProfile.points));
                    }}
                  >
                    <Download />
                    Download the radial profile
                  </Button>
                  <p className="text-sm leading-snug text-muted-foreground">
                    A CSV file: radius in inches, thickness with the part
                    moving, and thickness if the part sat still.
                  </p>
                </div>
              </CardContent>
            </Card>

            <MaskPanel coating={settledCoating} onOffset={onMaskOffset} />
            <ChamberDiagram
              geometry={{
                sunDiameter,
                planetDiameter,
                partDiameter,
                orbitRadius,
                spinRatio,
                sourceOffset,
                targetDiameter,
                throwDistance,
                sunAngleDeg,
                targetTiltDeg,
                targetOscillationDeg,
                maskOffsetIn,
                focalLength,
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
