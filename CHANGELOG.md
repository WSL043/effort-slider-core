# Changelog

## 2.1.0

The first version meant for release. The feature set is the 2.0.0 rewrite below;
this entry lists what changed after review while it was still unreleased.

### Fixed

- `setValue()` and `destroy()` are closures, not methods, so a handle survives
  being destructured: `const { setValue } = slider` no longer loses its
  receiver.
- `effort-slider-core/renderer` has its own declaration file instead of the
  whole package surface, so an editor stops offering the core from that entry.
- The package description names five presets, not ten.

### Changed

- The `main` field is gone; `exports` is the only resolution map. The package
  was already ESM only, and a `main` pointing at ESM only invited
  `ERR_REQUIRE_ESM` from tools that ignore `exports`. The README says so.
- README screenshots are quantised: `docs/` goes from 538 kB to 149 kB, and the
  packed package from 589 kB to 198 kB.

### Added

- `PUBLISH.md`, the release checklist, including the `repository` and
  `homepage` fields that cannot be filled in before the repository exists.
- A regression test for a destructured handle.

## 2.0.0 (unreleased draft)

A rewrite. The idea is the same (effort you can see); every part was rebuilt.

### Slider

- The control is now framework-free: `createEffortSlider(element, options)`.
  React (`effort-slider-core/react`) and a custom element
  (`effort-slider-core/element`) are thin wrappers. The package ships plain
  JavaScript, so consumers no longer need a JSX transform.
- Own pointer and keyboard handling on a `role="slider"` element replaces the
  hidden native range input. The thumb rides a spring, the stops are gently
  magnetic during a drag, and the thumb squashes slightly with speed.
- A drag commits on release only. The 450 ms "commit while still dragging"
  timer is gone. A burst of key presses commits once.
- Async `onChange` has a visible pending state, and a newer gesture outranks
  an older answer. A refusal shakes the rail and calls `onReject`.
- Works controlled or uncontrolled. Right-to-left layouts are supported.
- Any number of levels, given as ids or objects. Levels can carry a hint, a
  custom intensity, and arbitrary fields such as a token budget.
- Three sizes, label position top, bottom or none, four thumb shapes.
- Labels inherit the host's font and text colour; the slider no longer draws
  its own panel around itself.

### Energy rendering

- The rail's light follows the effort slider in Claude Code and the
  open-source study of it (claude-range-slider), rewritten independently and
  written down as rules: light is an event, every cell is an individual, the
  front is the most alive part, the source has a pulse, colour is temperature,
  light lingers, only what is hot glows, and the whole control is one moment.
- Four modes read those rules through different phenomena: `fire` (the rail
  catches), `synapse` (each beat finds its own path), `frost` (cold spreads,
  crystals glint), `plankton` (dark water that lights where it is stirred,
  including by the thumb's own movement).
- Every level is a stage: effort is how far the event runs. Lowering the level
  is an event too; a change of mind turns it around from where it is. A
  selection sends a pulse out from the source.
- At Off the rail is exactly empty. (The 8-bit afterglow can now reach zero,
  and the canvas is cleared when the light has gone out.)
- The level's name rises into place and glows with the rail's light.
- Event timing lives in `createCombustion` (no DOM, tested in Node) and is
  shared with the shader.
- Light theme is composited as ink. Output is premultiplied alpha; no
  `mix-blend-mode` is needed.
- Cells stay square at any rail width. v1 stretched a fixed 72 by 6 lattice.
- The afterglow is scaled by real frame time. Reduced motion draws one still
  frame. When the light is out, the loop stops.
- Without WebGL2, after context loss, or with `render: 'css'`, a CSS gradient
  fill built from the same palette takes over.

### Colour and presets

- 5 presets: `flame` (default) and `ember` in fire, `synapse`, `frost`,
  `plankton`. A preset is data: mode, thumb, parameters, and a light and dark
  palette.
- Palettes are temperature ramps of two or more stops, interpolated in OKLab.
- `accent` derives a full light and dark palette from one colour.
- Five ready-made scales in `LEVEL_SETS`.

### Package

- TypeScript declarations.
- `effort-slider-core/core` runs without a DOM.
- `npm run build` also writes `dist/` for use without a bundler.
- The demo no longer bundles React: 53 kB, down from 178 kB.
- CSS class prefix changed from `nrs-` to `es-`.

### Removed

- `mode`, `efforts`, `colors.{light,dark}.{main,base}`, `labels.{effort,empty}`,
  `onRejected`, `PALETTE_PRESETS`, `energyIntensity`, `normalizePalette`.
  The README has a migration table.

## 1.0.0

Initial release: a React component with one cellular WebGL field.
