# Coating uniformity

Planetary coating thickness calculator for ion-beam and electron-beam sources.

## Version

The app version lives in `package.json` and is shown in the page footer (for example, Version 0.3.0). Bump it on significant changes — new physics defaults, major UI unit or mask behavior changes, or other user-visible shifts — not on every small fix.

## Units

All lengths are in **millimeters**.

## Geometry

The optic is centered on the planet. Its rim lies in the plane z = 0. By default it is 203.2 mm across and flat. The optic control is signed sag in millimeters. 0 is plano. Positive is convex toward the target: the center is closer than the rim, so the coat is thicker at the center. Negative is concave toward the target: the center is farther, so the coat is thicker at the edge. Closer to the target means thicker coating — curvature moves the glass in z; arrival cosine follows the planet face after sun tilt. The sphere radius follows from the sag and the optic diameter. The steepest sphere that covers the optic is a hemisphere, so the largest |sag| is half the diameter. The mask is designed for the curve that is set, and its clearance is measured from the glass nearest the target so the plate does not cut the optic.

Throw distance (default 304.8 mm) is the height of the target center above the part. Spector does not publish that distance, so 304.8 mm stays the number you entered. A still part under the target gets more even as this grows. The orbiting part does not: with the target fixed 304.8 mm from the sun center, the flat ion-beam coat is most even near the 304.8 mm throw and least even near 508 mm, then improves again. A longer throw moves the planet path through a different part of the plume. The ion-beam plate starts at −45° from face-down (VacCoat IBS layout): the plate normal tips toward the outboard gun, the ion flux meets that face at 45°, and sputtered atoms leave about 45° from the normal on the opposite side — straight down onto the parts, not along the normal. The gun sits outboard at target height. The target rocks ±3° either side of that plate aim. The ion gun stays put, so the flux’s angle on the face swings by the same ±3°. That rock is the fixture swing, not a published Spector number.

The sun plate is 508 mm across and the planet is 203.2 mm across. The planet sits on that plate, so its center orbits at `(sun − planet) / 2 = 152.4` mm. Gears that mesh on the outside would orbit at `(sun + planet) / 2 = 355.6` mm, which puts the planets off a 508 mm plate. The target starts 304.8 mm from the center of the sun plane. That is the Hf target distance. The throw, also 304.8 mm, is the height straight down to the parts, so the target sits outside the planet path. A button can put the target back over that path, at 152.4 mm.

Orbit radius follows the plate formula until you type your own value. The distance from the sun center stays at 304.8 mm, and the gearing stays at 20, when the sun or planet diameter changes, until you choose otherwise.

## Sources

Ion-beam sputtering is selected by default. The 160 mm (16 cm) size is the ion beam, not a disk of sputtered atoms. The beam is taken as flat through the inner three-quarters of its radius, then it falls smoothly to zero at the edge. That shape is a stand-in, not a measured Spector curve. The ion flux comes from the outboard side and hits the tipped plate at 45° to the target normal, so the spot is an ellipse about 226 mm by 160 mm. The long axis points along the sun radius. Each patch of that spot emits a cosine spray about the specular leave axis (plume sharpness 2), brighter where more ions land — not a cosine about the plate normal. Electron-beam also starts at sharpness 2 from a point and leaves along the plate normal. Switching method sets sharpness, beam diameter, and plate aim back to that method’s values. Sharpness can still be edited afterward.

## Uniformity

The large number is `±(max − min) / (2 × mean) × 100%`. The full swing `(max − min) / mean × 100%` is shown under it. Spector datasheets quote about ±0.5% or better with uniformity masks. This large number has no mask.

## Uniformity mask

A separate card designs a stationary mask for the inputs on the page. The plate sits parallel to the coated face, near the part (within 101.6 mm of the glass), between the part and the target, and it does not spin or orbit. Metal is either open or blocked. The search aims for ±0.5% or better, then keeps the smallest finger that still hits that aim so more of the coat rate survives. It cannot add material. Choosing “Design the mask again” builds a new plate. The outline downloads as millimeters in the mask plane.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).
