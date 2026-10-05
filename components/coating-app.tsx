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
  METHOD_TARGET_TILT,
  gearMeshOrbitRadius,
  gearSpinRatio,
  describeOpticSag,
  maxOpticSag,
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
import { APP_VERSION } from "@/lib/version";

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
  const [sag, setSag] = useState(DEFAULT_COATING.sag);
  const [maskOffsetIn, setMaskOffsetIn] = useState<number | null>(null);
  const onMaskOffset = useCallback((mm: number | null) => {
    setMaskOffsetIn(mm);
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
      sag,
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
      sag,
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
      const next = thicknessProfile(settledCoating);
      if (!cancelled) setProfileState({ key: profileKey, profile: next });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settledCoating, profileKey]);
  // Only the profile for the current inputs. A stale curve from the other
  // sag sign must not keep showing the same before-mask ±%.
  const profile = profileState?.key === profileKey ? profileState.profile : null;
  const shownProfile = profile;

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
      sag: settledCoating.sag,
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
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold tracking-wide text-amber-950 sm:text-base">
        WARNING — work in progress
      </div>
      <div className="h-1.5 bg-primary" aria-hidden="true" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        <header className="max-w-3xl">
          <p className="text-sm font-medium text-primary">Planetary rotation</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Coating thickness from center to edge
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Set the coating method, the chamber, and the optic curve, then
            read how thick the coating is from the center out to the edge.
            A sag of 0 is a flat optic. The mask below is designed for
            whatever curve is set.
          </p>
        </header>

        <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Setup</CardTitle>
              <CardDescription>Lengths are in millimeters.</CardDescription>
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
                        setTargetTiltDeg(METHOD_TARGET_TILT[item.value]);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <p id="coating-method-hint" className="text-sm leading-snug text-muted-foreground">
                  Ion-beam sputtering aims the target like VacCoat’s IBS sketch: the plate is tipped −45° so the plate normal leans toward the outboard gun, the ion flux meets that face at 45°, and sputtered atoms leave about 45° from the normal on the opposite side — straight down onto the parts, not along the normal. The 16 cm flat-top beam paints the ellipse on that face. Electron-beam is a small melt pool, a point where the target sits, leaving along the plate normal with no ion ellipse. Switching sets the sharpness, source size, and plate aim back to that method. Sharpness can still be edited afterward.
                </p>
              </div>

              <NumericControl
                id="throw-distance"
                label="Throw distance"
                hint="Distance from the target center down to the flat part. Spector does not publish this distance. A still part under the target gets more even as this grows. The orbiting part does not: with the target 304.8 mm from the sun center, the flat ion-beam coat is most even near the 304.8 mm throw and least even near 508 mm, then improves again. A longer throw moves the planet path through a different part of the plume."
                value={throwDistance}
                min={50.8}
                max={914.4}
                step={1}
                suffix="mm"
                onChange={setThrowDistance}
              />
              <NumericControl
                id="plume-sharpness"
                label="Plume sharpness"
                hint="1 is an even spray around the preferred leave direction. Higher numbers bunch the spray along that axis. For ion-beam that axis is the specular leave (~45° from the plate normal, opposite the gun), not the normal itself. Ion-beam and electron-beam both start at 2; electron-beam leaves along the plate normal."
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
                    ? `Diameter of the ion beam, not the sputtered spot. Starts at 160 mm, the published 16 cm source. The beam is taken as flat through the inner three-quarters of its radius, then it falls smoothly to zero at the edge. That shape is a stand-in, not a measured Spector curve. At 45° to the target it paints an ellipse ${(beamSpot.longRadius * 2).toFixed(1)} mm by ${(beamSpot.shortRadius * 2).toFixed(1)} mm. The long axis points along the sun radius.`
                    : "Electron-beam starts at 0, a point, because the melted pool is small. Switching method resets this."
                }
                value={targetDiameter}
                min={0}
                max={508}
                step={1}
                suffix="mm"
                onChange={setTargetDiameter}
              />
              <NumericControl
                id="target-tilt"
                label="Target tilt"
                hint={
                  method === "ibs"
                    ? "Starts at −45° from face-down: the plate normal tips toward the outboard gun so the specular coat leave aims straight down onto the parts (VacCoat IBS layout). The ion gun stays fixed for that aim and meets the face at 45°. Rocking swings about this aim. Tilting more positive tips the normal toward the sun and aims the coat inward."
                    : "Starts at 0°, face-down. Electron-beam leaves along the plate normal. Positive tilt aims that normal inward, toward the sun."
                }
                value={targetTiltDeg}
                min={-80}
                max={80}
                step={1}
                suffix="°"
                onChange={setTargetTiltDeg}
              />
              <NumericControl
                id="target-oscillation"
                label="Target oscillation"
                hint={`The target rocks this far either side of the plate aim while the part turns. Starts at ±${TARGET_OSCILLATION_DEG}°. The ion gun stays put, so the ion flux’s angle on the face swings by the same amount around 45°. Equal time at each angle. 0° holds the target still.`}
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
                hint="Diameter of the optic, centered on the planet. The largest sag is a hemisphere: half this diameter."
                value={partDiameter}
                min={25.4}
                max={609.6}
                step={1}
                suffix="mm"
                onChange={(next) => {
                  setPartDiameter(next);
                  const limit = maxOpticSag(next);
                  setSag((current) => {
                    if (!Number.isFinite(current)) return 0;
                    return Number(
                      Math.min(limit, Math.max(-limit, current)).toFixed(2),
                    );
                  });
                }}
              />
              <NumericControl
                id="optic-sag"
                label="Sag"
                hint="Center height relative to the rim, in millimeters. 0 is flat. Positive is convex toward the target: the center is closer than the rim, so the coat is thicker at the center. Negative is concave toward the target: the center is farther, so the coat is thicker at the edge. Closer to the target means thicker coating. The steepest surface is a hemisphere, so |sag| cannot exceed half the optic diameter."
                value={sag}
                min={-maxOpticSag(partDiameter)}
                max={maxOpticSag(partDiameter)}
                step={0.25}
                suffix="mm"
                onChange={setSag}
              />
              <p className="text-sm leading-snug text-foreground">{describeOpticSag(partDiameter, sag)}</p>
              <NumericControl
                id="planet-diameter"
                label="Planet diameter"
                hint="Diameter of the planet that carries the part around the chamber."
                value={planetDiameter}
                min={25.4}
                max={609.6}
                step={1}
                suffix="mm"
                onChange={updatePlanet}
              />
              <NumericControl
                id="sun-diameter"
                label="Sun diameter"
                hint="Diameter of the plate the planets sit on."
                value={sunDiameter}
                min={101.6}
                max={1219.2}
                step={1}
                suffix="mm"
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
                step={1}
                suffix="mm"
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
                      Sit the planet on the plate ({plateOrbit.toFixed(1)} mm)
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
                    ? "How far the target sits from the center of the sun plane. Starts at 304.8 mm, the Hf target. The throw is the height straight down to the parts, also 304.8 mm."
                    : "Kept equal to the orbit, so the target hangs over the planet’s path."
                }
                value={sourceOffset}
                min={-762}
                max={762}
                step={1}
                suffix="mm"
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
                      Put the target over the path ({orbitRadius.toFixed(1)} mm)
                    </Button>
                  ) : null
                }
              />
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            <PlaySliders
              distanceIn={sourceOffset}
              onDistance={(mm) => {
                setOffsetManual(true);
                setSourceOffset(mm);
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
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Spector quotes ±0.5% and ±0.25% with uniformity masks. This
                    number has no mask. The mask card below trims the thick parts.
                    {sag !== 0 ? ` ${describeOpticSag(partDiameter, sag)}` : ""}
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
                    A CSV file: radius in millimeters and relative thickness with
                    the part orbiting and spinning.
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
                sharpness,
                sunAngleDeg,
                targetTiltDeg,
                targetOscillationDeg,
                maskOffsetIn,
                sag,
              }}
            />
          </div>
        </div>
      </main>
      <footer className="border-t border-border px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
        Made by{" "}
        <a
          href="https://www.linkedin.com/in/colin-harthcock-18334b105"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Colin Harthcock
        </a>
        <span className="mx-2 text-border" aria-hidden="true">
          ·
        </span>
        Version {APP_VERSION}
      </footer>
    </div>
  );
}
