# Coating thickness on a flat part

A small lab-style calculator for coating thickness on a flat disk in a planetary rotation system. You set the source and the chamber geometry, and the page plots relative thickness from the center of the part out to the edge.

Mask design for lenses is out of scope. This flat-part model is the base that work would build on.

All lengths are in inches.

## Geometry

The optic is centered on the planet. Its rim lies in the plane z = 0. By default it is 8 inches across and flat. The optic control is focal length in inches. 0 is plano, sag 0. Positive focal length is converging: the surface is hollow toward the target, so the center is farther from the target than the rim. Negative focal length is diverging: the surface bulges toward the target, so the center is closer. Focal length is half the radius, and the sign is which way the surface bends. The sphere radius is R = −2f. The steepest sphere that covers the optic is a hemisphere, so the shortest focal length is a quarter of the diameter. The mask is designed for the curve that is set, and its clearance is measured from the glass nearest the target so the plate does not cut the optic.

Throw distance (default 12 inches) is the distance from the target down to the part. Spector does not publish that distance, so 12 inches stays the number you entered. A still part under the target gets more even as this grows, but the orbiting part can get worse for a while, because the target stays put sideways and a longer throw puts the planet path in a different part of the plume. The target faces the parts. Tilt starts at 0°, straight down, and the target rocks ±3° either side of that aim while the part turns. The ion gun stays put, so the beam’s angle on the target swings by the same ±3° around 45°. That rock is the fixture swing, not a published Spector drawing. With the target 12 inches from the sun center, turning that rock off leaves the flat-part uniformity at about ±0.33%. The 45° figure is the ion beam at the middle of the swing. It is not the target tilt.

The sun plate is 20 inches across and the planet is 8 inches across. The planet sits on that plate, so its center orbits at `(sun − planet) / 2 = 6` inches. Gears that mesh on the outside would orbit at `(sun + planet) / 2 = 14` inches, which puts the planets off a 20 inch plate. The target starts 12 inches from the center of the sun plane. That is the Hf target distance. The throw, also 12 inches, is the height straight down to the parts, so the target sits outside the planet path. A button can put the target back over that path, at 6 inches.

Orbit radius follows the plate formula until you type your own value. The distance from the sun center stays at 12 inches, and the gearing stays at 20, when the sun or planet diameter changes, until you choose otherwise.

Sun-to-planet gearing starts at 20: the planet turns 20 times, opposite the orbit, on each trip around the sun. Gearing is its own control. Matching the gear teeth to the plate diameters would give `sun / planet = 2.5` instead. Spector tooth counts are not published. The planet keeps circling for the whole coating. The planets are attached to the sun, so the sun angle is also their angle to the sputtered plume. 0° leaves them square to a downward beam. Positive drops the side under the target. The fixture stops at ±10°. There is no separate planet tilt on top of that.

Ion-beam sputtering is selected by default. The 6.3 inch (16 cm) size is the ion beam, not a disk of sputtered atoms. The beam is taken as flat through the inner three-quarters of its radius, then it falls smoothly to zero at the edge. That shape is a stand-in, not a measured Spector curve. The beam hits the target at 45° to the target normal, so the spot is an ellipse about 8.9 inches by 6.3 inches. The long axis points along the sun radius. Each patch of that spot emits a cosine spray (plume sharpness 1), brighter where more ions land. Electron-beam uses sharpness 2 from a point, because a melt pool is smaller and the spray is usually a bit tighter, not wider. Switching method sets sharpness and beam diameter back to that method’s values.

The second curve uses the same target and the same angle to the plume, with the part held still and centered under the target.

The large ±% and the center-to-edge plot follow the inputs on the page, including the sun angle that is set. “Recalculate uniformity” sweeps that ±10° and plots uniformity against the angle. Distances, plume sharpness, and beam diameter stay as above while the angle changes. The 45° ion beam and the target tilt are separate from this angle.

## Flux

Each bit of the target contributes `(cos α)^n × (cos β) / d^2 × area`. `cos α` is how far the departure is from the target normal. `cos β` is how far the arrival is from straight down onto the part. If either cosine is 0 or negative, that bit contributes nothing. A target width of 0 is one point and, with tilt 0, this is the usual cosine-to-the-n law on a flat plate.

Thickness at each radius is the average of that flux over the planet’s closed path (one orbit at the default gearing of 20), divided by the center so the center reads 1.00.

The large number is `±(max − min) / (2 × mean) × 100%`. The full swing `(max − min) / mean × 100%` is shown under it. Spector datasheets quote about ±0.5% or better with uniformity masks. This large number has no mask. With the target 12 inches from the sun center and gearing 20, square to the beam is about ±0.41%. Inside ±10° the best is about ±0.052% near −2.4°, which raises the side under the target a little. The curve is under ±0.5% from −4° to 0°, and under ±0.25% from about −3.6° to −1°. Both sides of that bottom are worse. That bowl is the expected shape.

A separate card designs a stationary mask for the inputs on the page. The plate sits parallel to the coated face, between the part and the target, and it does not spin or orbit. Metal is either open or blocked. The search picks the gap and a smooth finger that trims thick radii. It cannot add material. Two buttons choose where that plate is allowed to sit. Near the part looks only within 4 inches of the glass. Near the target looks only within 4 inches of the target. For the defaults above, the near-target plate sits about 11.6 in from the glass and the coat goes from about ±0.41% to about ±0.04%. Moving distance, gearing, sun angle, the target rock, or which end of the gap, then choosing “Design the mask again,” builds a new plate. The two place buttons only choose which end of the gap to search. The search starts when you choose “Design the mask again.” The outline downloads as inches in the mask plane, with the offset and which end of the gap in the file.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The dev server listens on all interfaces on port 43123.
