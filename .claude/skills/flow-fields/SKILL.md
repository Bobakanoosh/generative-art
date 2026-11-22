---
name: flow-fields
description: Use when building or tuning a piece around a flow field - "flow field", "noise field", "particles following a field", "curl noise", "streamlines", "ribbons", "trails", "veil fade", "pointer attract/repel", "particles bunch up or collapse", "faint trails never fade out". Technique distilled from flow-ribbons v1 and murmuration v1.
---

# Flow fields

Particles move through a vector field that comes from seeded noise. Two live references: `src/pieces/flow-ribbons/v1` (steps drawn as accumulating segments) and `src/pieces/murmuration/v1` (field baked on a grid, veil-fade trails, pointer). Code below uses only toolkit APIs (see `seeded-randomness-and-determinism`) and is meant for `src/pieces/**`.

## 1. Field kinds
**Angle from noise**: heading = `n(x*f, y*f) * TAU`. Simplest, but the field has sinks and sources, so particles bunch into dense lines and leave empty areas.

**Curl of a potential** (preferred): take a scalar noise `P`, velocity = `(dP/dy, -dP/dx)`. It is divergence-free, so density stays even and ribbons keep their width. Finite differences are fine.

```ts
import { atan2 } from '@/lib/art/math';
import { createNoise2D } from '@/lib/art/noise';
import type { Rng } from '@/lib/art/rng';

const W = 1000;

/** Heading (radians) of the curl of a two-octave noise potential. */
export function makeCurlHeading(rng: Rng, scale: number, turbulence: number) {
  const main = createNoise2D(rng);       // each call consumes the rng once
  const detail = createNoise2D(rng);     // independent octave
  const f = scale / W;                   // frequency per logical unit
  const fd = f * 3.1;                    // detail octave ~3x finer
  const eps = 0.5;
  const P = (x: number, y: number) =>
    main(x * f, y * f) + turbulence * 0.3 * detail(x * fd + 17.3, y * fd - 4.1);
  return (x: number, y: number) =>
    atan2(-(P(x + eps, y) - P(x - eps, y)), P(x, y + eps) - P(x, y - eps));
}
```

Parameters: `scale` (noiseScale ~0.3-6) is features across the canvas; low = broad currents, high = tight eddies. `turbulence` is the amplitude of a finer octave (0 = smooth, ~1 = curly). Offset octaves (`+ 17.3`) so they are not correlated. For an evolving field use `createNoise3D` and pass `i * rate` (murmuration: `TIME_RATE = 0.0016` per step).

## 2. Stepping
One step moves each particle `SPEED` logical units along the field (flow-ribbons: `SPEED = 2.4`). Step size is a look parameter: smaller = smoother curves, more steps needed. Time is the step index (`i * DT`, `DT = 1/60`), never wall-clock. Velocity-based pieces (murmuration) steer toward the field (`u += (wind - u) * STEER`) instead of snapping to it, which gives inertia.

```ts
import { cos, sin } from '@/lib/art/math';

function advance(
  xs: Float64Array, ys: Float64Array, alive: Uint8Array,
  heading: (x: number, y: number) => number, speed: number,
) {
  for (let k = 0; k < xs.length; k++) {
    if (!alive[k]) continue;
    const a = heading(xs[k], ys[k]);
    xs[k] += cos(a) * speed;   // toolkit cos/sin; Math.cos is banned
    ys[k] += sin(a) * speed;
  }
}
```

## 3. Seeding
- **Grid + jitter**: even coverage; `x = gx * cell + rng.range(-j, j)`.
- **Ribbon bands** (flow-ribbons): pick a centre, take the field heading there `+ HALF_PI`, lay strands side by side along that perpendicular with a little `rng.gaussian(0, 0.8)`. Strands share the field so they travel together and fan out where it diverges. Share strands across ribbons in proportion to span so density is even. Split a ribbon into colour bands (`mixHex(c0, c1, t)`).
- **Clusters/flocks**: seed around per-group centres (murmuration).
- Draw all seeding randomness in `setup`, in a fixed order.

## 4. Lifetimes and edges
- Per-ribbon `life` in steps; fade alpha in and out with `smoothstep` (`fade = (1 - smoothstep(0.75, 1, u)) * smoothstep(0, 0.25, u)`, `u = i / life`) so strokes do not start or end abruptly.
- Edges: **kill** (flow-ribbons fades alpha with distance to a margin and sets `alive = 0` at zero) or **steer back** with a soft wall force inside a margin (murmuration `WALL`). Wrapping around makes visible line jumps for stroke trails. Never respawn with `Math.random`; use a fixed rng draw count or a pre-seeded pool.

## 5. Trails: two approaches
**Accumulation** (flow-ribbons): never clear; each step draws a short low-alpha segment, overlaps build density. Alpha ~0.05-0.25. Cheap, and the image at step `n` is exactly the build to `n`.

**Veil fade** (murmuration): each step first fills the canvas with the background at `trail` alpha, then draws new strokes. Old strokes decay geometrically: comet trails. Draw each trail from the particle's last drawn position (`lx, ly`) to the new one.
- **8-bit stall**: a veil fainter than about 0.25 alpha can't finish the fade in 8-bit colour (a pixel within about 0.5 / alpha levels of the background rounds to no change), so old strokes stall as a tinted haze.
- **Don't veil in bursts.** murmuration v1 laid faint veils every `m` steps at the equivalent stronger alpha; the whole canvas then dims ~25% at once every few steps, which reads as a blink in live view and videos. v1 is frozen with it.
- **Fix (murmuration v2)**: veil every step at `trail` alpha, and every 4 steps run an exact clean-up that moves each channel one level towards the background, clamped at it: for channels where every palette colour is above the background, `lighten` with `bg + 1` then `difference` with `1` (= `max(p - 1, bg)`); below, `darken` with `bg - 1` then `lighter` with `1`. Opaque fills with separable blend modes are exact in 8 bits. See `cleanPlan` in `src/pieces/murmuration/v2/index.ts`. A channel with palette colours on both sides of the background can't be cleaned this way.
- Because trails then reach the background exactly, the piece can declare `fastForward` so single-image server renders only draw the last few hundred steps (see CLAUDE.md, "Long live renders"); test it byte-for-byte against a full render.

## 6. Density and cost
Render cost is particles x steps (server renders replay every step; endless pieces are capped by `MAX_STOP_STEP`; run `npm run test:slow`). Control density with particle count, `alpha` (more particles need lower alpha) and line width. A curl field keeps density even for particles that move *with* the field (position += field velocity); do not re-seed to fix clumping, switch field kind. Caveat: inertial (velocity-based) particles that steer towards the field can still clump in a curl field, since their momentum carries them off the streamlines; murmuration adds a density-pressure force (birds push apart where the local count is high) to keep the flock from collapsing. Veil-fade pieces also pay per canvas pixel: every veil is a full-canvas fill, so a server render's time grows with output width as well as steps, unless the piece declares `fastForward`.

## 7. Colour
- Palette index per ribbon/band or group; `mixHex` between neighbours for gradient bands.
- By heading: `palette[floor((a + PI) / TAU * n) % n]`, or `oklch(L, C, hue)` with `hue` from heading.
- By speed: map `speed / maxSpeed` (`map`, `clamp`) into a lightness or palette ramp.
- Pre-compute `rgba(...)` strings in `setup`; never build colour strings per particle per step.

## 8. Performance
- Typed arrays (`Float64Array`) for positions and velocities; no per-step allocation.
- Bake the field on a grid and refresh every N steps (murmuration: `CELL = 25`, `FIELD_EVERY = 2`), then bilinear-sample per particle. Far cheaper than several noise calls per particle per step.
- Batch by colour: set `strokeStyle` once per band; for large counts put many `moveTo/lineTo` in one path per colour and stroke once.
- No `getImageData`; keep history in `state`.

## 9. Determinism
Output depends only on version, seed, params and stop step. Toolkit math only (`@/lib/art/math`, `@/lib/art/noise`), one rng stream consumed in a fixed order in `setup`, no reordering of float summation. After a change run `npm run lint`, `npm test`, `npm run test:engines`. Changing a deployed version's behaviour is a new version (`new-version`).

## 10. Interactivity (pointer attract / repel)
Mark the piece `interactive: true`; `step(ctx, state, i, input)` gets `input.pointer: { x, y, down } | null` in logical coordinates and `input.keys`. Input is recorded and replayed, so server renders match. Apply a radial falloff only while held:

```ts
import type { InputFrame } from '@/lib/piece/types';

/** Velocity change for a particle at (x, y): pull toward the pointer, or push when repel. */
function pointerForce(
  input: InputFrame, x: number, y: number,
  radius: number, strength: number, repel: boolean,
): [number, number] {
  const p = input.pointer;
  if (!p || !p.down) return [0, 0];
  const dx = p.x - x;
  const dy = p.y - y;
  const d = Math.sqrt(dx * dx + dy * dy);   // sqrt is allowed
  if (d >= radius || d <= 1) return [0, 0]; // d > 1 guard avoids blow-up
  const f = (1 - d / radius) * strength * (repel ? -1.6 : 1);
  return [(dx / d) * f, (dy / d) * f];
}
```

Murmuration adds a swirl term (`nx - ny*SWIRL, ny + nx*SWIRL`) so a held pointer makes a vortex, and clamps max speed.

## Pitfalls
- Angle-from-noise collapses into lines; use curl.
- Noise frequency is in logical units (`scale / W`), never pixels.
- Trails that leave a tinted haze and never reach the background with a faint veil: section 5.
- Changing `createNoise2D` call order or octave order changes the field for every share code of that version.
