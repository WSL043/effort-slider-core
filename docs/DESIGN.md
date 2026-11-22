# How it works

This is the reference for anyone extending the slider or borrowing parts of
it. The README covers use; this covers the reasoning.

## The rules

The effect this project follows (the effort slider in Claude Code, and the
open-source study of it, claude-range-slider) is easy to imitate badly. Earlier
versions of this project did: they scrolled noise and painted it, and it read
as a texture pasted onto the rail. What the original gets right is not a
pattern but a set of choices about time and individuality. Written down:

1. **Light is an event.** Nothing moves without a reason. Something is chosen
   or touched, and something starts; every change has a start, a course and an
   end.
2. **Every cell is an individual.** A cell's hash sets its moment, its speed
   and its phase. Neighbours never agree, so fronts are ragged, bodies shimmer,
   and the crowd draws the shape.
3. **The front is the most alive part.** Where the change is happening, the
   light is strongest; once it arrives, it settles.
4. **The source has a pulse.** Something leaves the thumb and travels.
5. **Colour is temperature.** Fresh light is white, it cools to the hue, cold
   is dark. A dim cell leans to the hue, never to grey.
6. **Light lingers.** Each frame keeps part of the last, so motion is felt as
   breathing.
7. **Only what is hot glows.**
8. **The whole control is one moment.** The level's name rises into place and
   glows with the rail's light.
9. **Nothing jumps.** A living thing changes tempo; it never skips. Every
   motion that speeds up with effort reads the flow clock
   (`flow += dt * tempo`), never `time * speed`: with the latter, a change of
   speed shifts every wave by the whole elapsed time, and the fire stalls or
   runs backwards. That happened in an earlier build two seconds after
   reaching the top, as the post-selection tempo relaxed. For the same reason
   the loop no longer drops to half rate at rest.

And two that this project adds:

- **Effort is how far the event runs**, at every level, not only the top.
- **Ending is an event too.** Lowering the level makes the light recede cell
  by cell; a change of mind turns it around from where it is. At Off the rail
  is exactly empty.

## Deriving a phenomenon

The rules are not about fire. A derivation picks a natural phenomenon and
answers five questions with it; the answers become a mode in the shader.

| | fire | synapse | frost | plankton |
| --- | --- | --- | --- | --- |
| What is the event? | the rail catches | the source beats | cold spreads | the water is stirred |
| Who are the individuals? | cells catching on their own time | cells passing each beat on by chance | crystals of their own density | organisms with their own threshold |
| What is the front? | the burning edge, sparks ahead | cells twitching where beats die | a thin freezing line, needles ahead | the swell |
| What is the pulse? | beats along the fire | the beat | a slow cold breath | swells; the thumb's wake |
| What lingers? | flame, then embers | the path of each beat | the crystals | the glow of each answer |

A good derivation changes behaviour, not colour. Colour belongs to the
palette, and `accent` already covers it.

## Layers

```
core/levels.js    the scale: normalise, snap, interpolate intensity
core/model.js     gestures to commits (no DOM, fully tested in Node)
core/spring.js    thumb motion
core/color.js     OKLab ramps, palette from one accent
core/combustion.js  the fire's events and their timing (no DOM, tested in Node)
core/presets.js   materials as data
render/shaders.js GLSL for the four modes, the glow and the composite
render/renderer.js draws a frame of fire with WebGL2, keeping the afterglow
dom/slider.js     DOM, events, the frame loop; wires the rest together
react.js, element.js   thin shells over dom/slider.js
```

Nothing below `dom/` knows about the DOM, and nothing in `render/` knows about
sliders. That is what lets the model be tested without a browser and the
renderer be reused for other surfaces.

## The gesture model

`createSliderModel` turns low-level input into three facts the view needs:
where the thumb is heading (`target`), which level the gesture is on
(`preview`), and which level the host last accepted (`committed`).

```
drag:      dragStart -> dragMove* -> dragEnd          commit on release
keyboard:  previewIndex* -> (pause 160 ms | blur)     commit once
click:     jumpTo                                     commit now
```

Rules it enforces:

1. `onCommit` is never called for the level that is already accepted, unless
   another commit is still open (then the host has to hear the change of mind).
2. A refusal (`false`, a throw, a rejected promise) restores `preview` and
   `target` to `committed`.
3. Each commit takes a token. When an answer arrives for an old token, it may
   update `committed`, but it never moves the thumb.
4. `setValue` from the host updates `committed` at once, but does not move the
   thumb out from under a drag.

## The frame loop

`dom/slider.js` runs one `requestAnimationFrame` loop per slider while the
light is alive, and draws every frame. It stops when the light is out and its
embers have cooled, when the slider is off screen, when the tab is hidden, or
when motion is `still`.

Two clocks drive the shader: `time` (plain seconds, for steady things such as
the core's breathing) and `flow` (seconds integrated at the current tempo,
for everything that speeds up with effort or with the person's activity). The
tempo is `tempoOf(level, charge)`; `charge` rises while the person acts and
relaxes over a couple of seconds afterwards, so the light visibly calms, but
through `flow` that calming is a smooth deceleration.

The afterglow is scaled by the real time between frames
(`persistence ^ (dt * 60)`), so a 120 Hz screen and a 60 Hz one look alike.
With reduced motion each change draws one still frame with no catching or
receding and no afterglow.

## Timing the events

`core/combustion.js`. The fire's extent is a fraction (0-1) of the filled rail,
the part behind the thumb. `extentOf(intensity)` maps a level to it: about 0.15
at the bottom, 1 at the top.

An event runs from `from` to `to`, `since` seconds ago. Each cell, with its
hash `h`, has its own course:

| | Catching (`to > from`) | Going out (`to < from`) |
| --- | --- | --- |
| Waits | `h * 0.9` s | `(1 - h) * 0.45` s |
| Runs for | `2.2 / (0.85 + 0.3 h)` s | `0.9 / (0.85 + 0.3 h)` s |
| Curve | ease-out (fast, then settling) | ease-in-out |

So the first cells to catch are also the last to go out. When a new level
arrives mid-event, the new event starts from the average cell's current
extent, so the fire turns around rather than jumping. The shader uses the same
constants (`TIMING`), passed as a uniform.

## Drawing a frame

`render/shaders.js`, pass 1 (`FIELD`). Shared by every mode: the cell, its
hashes, its own course through the current event (`extent`, `running`,
`joinedAgo()`, `leftAgo()`), the shape across the rail, and the afterglow.
Each mode then adds light with `add(energy, temperature)`:

- **fire.** A body of `(1 - dn) ^ 0.65` in which three waves of different
  length run away from the source, each cell in its own phase, and two slower
  beats measured along the fire. A flash as each cell is reached. A burning
  edge that shimmers while it runs and smoulders once it arrives, with sparks
  ahead of it; sparks thrown back along each row; embers when going out; a
  white core behind the thumb.
- **synapse.** The source beats at a rate set by effort. Each row conducts at
  its own speed and each cell answers a little early or late, so a beat
  arrives as a scatter. A cell passes a beat on only by chance, re-thrown for
  every beat, and less often far from the source. Fresh answers are white and
  cool quickly. The source core flashes with every beat.
- **frost.** Frozen cells hold still at their own density. Half of them glint,
  rarely and sharply, each at its own moment. A slow bright breath leaves the
  source every few seconds. While cold spreads, the freezing line is thin and
  white and a few needles reach ahead. Going out, crystals brighten once as
  they melt.
- **plankton.** Dark water. Swells leave the source, more often and further
  with effort; each organism is roused by a given swell only by chance, and
  answers only if the swell beats its own threshold. Moving the thumb stirs
  the water around it. A selection is one strong push.

**Afterglow.** The result is added to the last frame scaled by
`persistence ^ (dt * 60)`, so light builds up and drains away; a flash
brighter than the build-up still shows through. A small constant is
subtracted each frame so the 8-bit buffer can reach zero; without it a fading
value rounds to the same faint step forever (that was the "colour left at Off"
bug). When the event has ended at Off, the slider also clears the canvas.

Energy and temperature are written separately. Pass 2 blurs only what is
above `threshold`. Pass 3 colours by temperature through the ramp, leaning dim
cells toward the hue: on a dark rail light adds up and rolls off to white; on a
light rail it is ink. The dither is applied only where there is light.

## Making a material

Within a mode, a preset changes the material:

- **Calmer:** lower `flicker` and `speed`, raise `persistence`.
- **Sharper:** more `rows`, higher `flicker` and `speed`, lower `persistence`.
- **Shorter at every level:** lower `reach`.

To add a mode: answer the five questions above, write a `yourMode()` function
next to the others using the shared cell state and `add()`, add its name to
`MODES` in both `render/shaders.js` and `core/presets.js` (the tests check they
match), and make a preset that uses it. Check it at the lowest level, at the
top, going down to Off, and in both themes.

Palette rules: a ramp runs coldest to hottest with two or more stops; on dark
rails end near white, on light rails end in a deep shade; keep the hot end at
3:1 contrast against the rail (the tests check the built-in presets); tint the
rail slightly toward the hue.

## Limits

- WebGL2 is required to draw the rail's light. Without it, the rail shows a CSS
  gradient from the same palette.
- Browsers cap live WebGL contexts per page (about 16 in Chrome). Each
  animated slider holds one.
- Checked in headless Chrome only. Shaders use core GLSL ES 3.00 and 8-bit
  render targets, with no extensions.
