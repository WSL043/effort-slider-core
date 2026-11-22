import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  PARAM_DEFAULTS,
  MODES,
  TIMING,
  cellExtent,
  createCombustion,
  eventLength,
  extentOf,
  tempoOf,
  LEVEL_SETS,
  PRESETS,
  Spring,
  THUMBS,
  buildRampTexture,
  contrast,
  createSliderModel,
  intensityAt,
  isHex,
  luminance,
  magnetize,
  normalizeLevels,
  paletteFromAccent,
  parseHex,
  rampGradient,
  resolvePreset,
  sampleRamp,
  snapIndex,
} from '../src/core/index.js'
import { BLUR, COMPOSITE, FIELD, MODES as RENDER_MODES, VERTEX } from '../src/render/shaders.js'

const root = name => new URL(`../${name}`, import.meta.url)
const QUAD = normalizeLevels(LEVEL_SETS.quad)

// ------------------------------------------------------------------ levels

test('levels accept ids or objects and drop what cannot be shown', () => {
  const levels = normalizeLevels(['off', { id: 'deep', name: 'Deep think', budgetTokens: 9000 }, null, { id: '' }, 'off', 42])
  assert.deepEqual(levels.map(level => level.id), ['off', 'deep'])
  assert.equal(levels[0].name, 'Off')
  assert.equal(levels[1].budgetTokens, 9000)
  assert.deepEqual(levels.map(level => level.ratio), [0, 1])
  assert.ok(Object.isFrozen(levels[0]))
})

test('a scale needs at least two levels', () => {
  assert.deepEqual(normalizeLevels(['only']), [])
  assert.deepEqual(normalizeLevels(undefined), [])
  assert.deepEqual(normalizeLevels('low,high'), [])
})

test('default intensity starts at zero, ends at one, and keeps the middle calm', () => {
  const [off, low, high, max] = QUAD.map(level => level.intensity)
  assert.equal(off, 0)
  assert.equal(max, 1)
  assert.ok(low < 1 / 3 && high < 2 / 3 && low < high)
})

test('a level can declare its own intensity', () => {
  const levels = normalizeLevels([{ id: 'a', intensity: 0.4 }, { id: 'b', intensity: 7 }])
  assert.deepEqual(levels.map(level => level.intensity), [0.4, 1])
})

test('intensity interpolates between neighbouring levels', () => {
  assert.equal(intensityAt(QUAD, 0), 0)
  assert.equal(intensityAt(QUAD, 1), 1)
  const halfway = intensityAt(QUAD, 0.5)
  assert.ok(halfway > QUAD[1].intensity && halfway < QUAD[2].intensity)
  assert.equal(intensityAt(QUAD, Number.NaN), 0)
  assert.equal(intensityAt([], 0.5), 0)
})

test('positions snap to the nearest level', () => {
  assert.equal(snapIndex(4, -1), 0)
  assert.equal(snapIndex(4, 0.16), 0)
  assert.equal(snapIndex(4, 0.18), 1)
  assert.equal(snapIndex(4, 0.84), 3)
  assert.equal(snapIndex(4, 9), 3)
  assert.equal(snapIndex(1, 0.5), 0)
})

test('the magnet keeps stops fixed, stays monotonic, and pulls toward stops', () => {
  for (const stop of [0, 1 / 3, 2 / 3, 1]) assert.ok(Math.abs(magnetize(stop, 4, 0.5) - stop) < 1e-9)
  let previous = -1
  for (let step = 0; step <= 200; step += 1) {
    const value = magnetize(step / 200, 4, 0.8)
    assert.ok(value >= previous - 1e-12)
    previous = value
  }
  assert.ok(Math.abs(magnetize(0.38, 4, 0.5) - 1 / 3) < Math.abs(0.38 - 1 / 3))
  assert.equal(magnetize(0.38, 4, 0), 0.38)
})

test('every built-in scale is usable as shipped', () => {
  for (const [name, scale] of Object.entries(LEVEL_SETS)) {
    const levels = normalizeLevels(scale)
    assert.equal(levels.length, scale.length, name)
    assert.ok(levels.every(level => typeof level.hint === 'string' && level.hint.length > 0), name)
    const intensities = levels.map(level => level.intensity)
    assert.deepEqual([...intensities].sort((a, b) => a - b), intensities, `${name} intensities ascend`)
  }
})

// ------------------------------------------------------------------- color

test('hex parsing is strict', () => {
  assert.deepEqual(parseHex('#ff0000'), [1, 0, 0])
  assert.deepEqual(parseHex('#0f0'), [0, 1, 0])
  assert.equal(parseHex('ff0000'), null)
  assert.equal(parseHex('red'), null)
  assert.equal(isHex(undefined), false)
})

test('ramps start and end on their stops', () => {
  const stops = ['#3a1c7a', '#9a4cf5', '#fff1fa']
  assert.equal(sampleRamp(stops, 0), '#3a1c7a')
  assert.equal(sampleRamp(stops, 1), '#fff1fa')
  assert.equal(sampleRamp(stops, 0.5), '#9a4cf5')
  const texture = buildRampTexture(stops, 16)
  assert.equal(texture.length, 64)
  assert.deepEqual([...texture.slice(0, 4)], [0x3a, 0x1c, 0x7a, 255])
  assert.deepEqual([...texture.slice(60, 64)], [0xff, 0xf1, 0xfa, 255])
  assert.match(rampGradient(stops, 'to left'), /^linear-gradient\(to left, #3a1c7a, .+#fff1fa\)$/)
})

test('one brand colour yields a complete palette for both themes', () => {
  for (const accent of ['#e11d48', '#0ea5e9', '#22c55e', '#808080', '#000000', '#ffffff']) {
    const palette = paletteFromAccent(accent)
    for (const theme of [palette.dark, palette.light]) {
      assert.ok(isHex(theme.track), accent)
      assert.equal(theme.ramp.length, 4)
      assert.ok(theme.ramp.every(isHex), accent)
    }
    assert.ok(luminance(palette.dark.track) < 0.05 && luminance(palette.light.track) > 0.8, accent)
    assert.ok(luminance(palette.dark.ramp.at(-1)) > luminance(palette.dark.ramp[0]), accent)
    assert.ok(luminance(palette.light.ramp.at(-1)) < luminance(palette.light.ramp[0]), accent)
  }
  assert.equal(paletteFromAccent('nope'), null)
})

// ----------------------------------------------------------------- presets

test('every preset is complete and legible in both themes', () => {
  assert.equal(PRESETS.flame.mode, 'fire')
  assert.equal(PRESETS.plain, undefined)
  for (const [id, preset] of Object.entries(PRESETS)) {
    assert.equal(preset.id, id)
    assert.ok(MODES.includes(preset.mode), id)
    assert.ok(THUMBS.includes(preset.thumb), id)
    assert.ok(preset.name.length > 0 && preset.description.length > 0 && preset.phenomenon.length > 0, id)
    for (const key of Object.keys(PARAM_DEFAULTS)) {
      assert.ok(Number.isFinite(preset.params[key]), `${id}.${key}`)
    }
    for (const theme of [preset.dark, preset.light]) {
      assert.ok(isHex(theme.track), id)
      assert.ok(theme.ramp.length >= 2 && theme.ramp.every(isHex), id)
      // The hottest colour is what must stand out from the rail.
      assert.ok(contrast(theme.ramp.at(-1), theme.track) >= 3, `${id} hot end contrast`)
    }
    assert.ok(luminance(preset.dark.ramp.at(-1)) > luminance(preset.dark.ramp[0]), `${id} dark ramp climbs to light`)
    assert.ok(luminance(preset.light.ramp.at(-1)) < luminance(preset.light.ramp[0]), `${id} light ramp climbs to deep`)
  }
})

test('presets resolve from ids, objects, and bad input alike', () => {
  assert.equal(resolvePreset('ember').mode, 'fire')
  assert.equal(resolvePreset('frost').mode, 'frost')
  assert.equal(resolvePreset('no-such-preset').id, 'flame')
  assert.equal(resolvePreset(undefined).id, 'flame')

  const custom = resolvePreset({ id: 'mine', mode: 'plankton', thumb: 'orb', dark: { ramp: ['#002244', '#00ccff', '#ffffff'] }, params: { sparks: 999, reach: 'x' } })
  assert.equal(custom.mode, 'plankton')
  assert.equal(custom.thumb, 'orb')
  assert.deepEqual(custom.dark.ramp, ['#002244', '#00ccff', '#ffffff'])
  assert.equal(custom.dark.track, PRESETS.flame.dark.track)
  assert.deepEqual(custom.light, { track: PRESETS.flame.light.track, ramp: [...PRESETS.flame.light.ramp] })
  assert.equal(custom.params.sparks, 3, 'clamped to its range')
  assert.equal(custom.params.reach, 1, 'a bad value keeps the default')

  assert.equal(resolvePreset({ extends: 'synapse', mode: 'bogus' }).mode, 'synapse')
  assert.equal(resolvePreset({ extends: 'ember' }).params.persistence, PRESETS.ember.params.persistence)
})

test('overrides layer on top of a preset', () => {
  const accented = resolvePreset('flame', { accent: '#e11d48' })
  assert.equal(accented.mode, 'fire')
  assert.notDeepEqual(accented.dark.ramp, [...PRESETS.flame.dark.ramp])
  const recoloured = resolvePreset('flame', { accent: '#e11d48', colors: { dark: { track: '#000000' } } })
  assert.equal(recoloured.dark.track, '#000000')
  assert.deepEqual(recoloured.dark.ramp, accented.dark.ramp)
  assert.equal(resolvePreset('flame', { thumb: 'bar', params: { bloom: 0 } }).thumb, 'bar')
  assert.equal(resolvePreset('flame', { params: { bloom: 0 } }).params.bloom, 0)
  assert.equal(resolvePreset('flame', { accent: 'nope' }).dark.track, PRESETS.flame.dark.track)
})

// -------------------------------------------------------------- combustion

test('effort is how far the fire reaches', () => {
  assert.equal(extentOf(0), 0)
  assert.equal(extentOf(1), 1)
  const steps = [0.05, 0.2, 0.5, 0.8, 1].map(level => extentOf(level))
  for (let index = 1; index < steps.length; index += 1) assert.ok(steps[index] > steps[index - 1])
  assert.ok(steps[0] > 0.1, 'the lowest level still smoulders at the thumb')
  assert.equal(extentOf(1, 0.5), 0.5)
  assert.equal(extentOf(1, 1.5), 1, 'never past the end of the rail')
})

test('each cell catches on its own time', () => {
  const early = cellExtent(0, 1, 0.5, 0.05)
  const late = cellExtent(0, 1, 0.5, 0.95)
  assert.ok(early > 0 && late === 0, 'a low hash catches first')
  for (const h of [0, 0.3, 0.7, 1]) assert.equal(cellExtent(0, 1, eventLength(0, 1), h), 1)
  // Catching starts fast and settles; going out starts slow and finishes.
  assert.ok(cellExtent(0, 1, TIMING.igniteDuration * 0.25, 0) > 0.5)
  assert.ok(cellExtent(1, 0, TIMING.quenchDuration * 0.25, 1) > 0.75)
  assert.ok(eventLength(1, 0) < eventLength(0, 1), 'going out is quicker than catching')
})

test('a change of mind turns the fire around from where it is', () => {
  const fire = createCombustion()
  assert.equal(fire.target(1), true)
  assert.equal(fire.target(1), false, 'the same level starts no new event')
  fire.advance(1.2)
  const midway = fire.meanExtent()
  assert.ok(midway > 0.2 && midway < 1)
  fire.target(0.3)
  assert.ok(Math.abs(fire.from - midway) < 1e-9, 'the new event starts at the fire, not at the old target')
  assert.equal(fire.since, 0)
  fire.advance(eventLength(fire.from, fire.to))
  assert.ok(Math.abs(fire.meanExtent() - extentOf(0.3)) < 1e-9)
})

test('the flow clock never jumps when the tempo changes', () => {
  // Regression: the shader used to compute phase as time * speed. When the
  // speed relaxed after a selection, every wave jumped by (elapsed time *
  // change in speed), so the longer the page had been open, the harder the
  // fire stalled or ran backwards a couple of seconds after reaching the top.
  const fire = createCombustion()
  fire.target(1)
  fire.advance(30, tempoOf(1, 0))
  let charge = 1
  let previous = fire.flow
  for (let frame = 0; frame < 300; frame += 1) {
    charge *= 0.97
    const tempo = tempoOf(1, charge)
    fire.advance(1 / 60, tempo)
    const step = fire.flow - previous
    assert.ok(step > 0, 'always moving forward')
    assert.ok(step <= tempo / 60 + 1e-9, 'never more than one frame of motion')
    previous = fire.flow
  }
  assert.ok(tempoOf(0) < tempoOf(1), 'more effort, faster life')
})

test('the fire stops asking for frames once it is out', () => {
  const fire = createCombustion()
  fire.target(0.8)
  fire.advance(10)
  assert.equal(fire.burning, true, 'a lit rail keeps burning')
  fire.target(0)
  assert.equal(fire.burning, true, 'embers are still cooling')
  fire.advance(eventLength(fire.from, 0) + 3)
  assert.equal(fire.burning, false)
  fire.settle(0.5)
  assert.equal(fire.from, fire.to)
  assert.equal(fire.changing, false, 'settle starts no event')
})

// ------------------------------------------------------------------ spring

test('the spring reaches its target and stops', () => {
  const spring = new Spring({ value: 0, stiffness: 380, damping: 27 })
  spring.target = 1
  let peak = 0
  for (let frame = 0; frame < 240 && !spring.settled; frame += 1) {
    spring.step(1 / 60)
    peak = Math.max(peak, spring.value)
  }
  assert.ok(spring.settled)
  assert.equal(spring.value, 1)
  assert.equal(spring.velocity, 0)
  assert.ok(peak < 1.2, 'overshoot stays small')
  spring.snap(0.25)
  assert.equal(spring.value, 0.25)
  assert.equal(spring.step(0), 0.25)
  assert.ok(Number.isFinite(spring.step(5)), 'a long pause between frames stays stable')
})

// ------------------------------------------------------------------- model

function harness(options = {}) {
  const calls = []
  const rejects = []
  const reasons = []
  const timers = []
  const model = createSliderModel({
    levels: QUAD,
    value: 'low',
    onCommit: id => { calls.push(id); return options.answer?.(id) },
    onReject: level => rejects.push(level.id),
    onState: (state, reason) => reasons.push(reason),
    setTimer: callback => timers.push(callback) - 1,
    clearTimer: handle => { timers[handle] = null },
    ...options.model,
  })
  const runTimers = () => timers.splice(0).forEach(callback => callback?.())
  return { model, calls, rejects, reasons, runTimers }
}

test('a drag previews freely and commits once on release', () => {
  const { model, calls } = harness()
  model.dragStart(0.3)
  for (const ratio of [0.4, 0.55, 0.7, 0.9, 0.97]) model.dragMove(ratio)
  assert.deepEqual(calls, [])
  assert.equal(model.state.preview, 3)
  assert.equal(model.state.committed, 1)
  model.dragEnd()
  assert.deepEqual(calls, ['max'])
  assert.deepEqual([model.state.committed, model.state.target, model.state.dragging], [3, 1, false])
})

test('releasing on the current level calls nobody', () => {
  const { model, calls, reasons } = harness()
  model.dragStart(0.3)
  model.dragMove(0.36)
  model.dragEnd()
  assert.deepEqual(calls, [])
  assert.equal(model.state.target, 1 / 3)
  assert.ok(reasons.includes('settle'))
})

test('a cancelled drag returns to the accepted level', () => {
  const { model, calls } = harness()
  model.dragStart(0.9)
  model.dragCancel()
  assert.deepEqual(calls, [])
  assert.deepEqual([model.state.preview, model.state.target], [1, 1 / 3])
})

test('a refusal rolls back, whether returned or thrown', () => {
  for (const answer of [() => false, () => { throw new Error('offline') }]) {
    const { model, calls, rejects } = harness({ answer })
    model.jumpTo(3)
    assert.deepEqual(calls, ['max'])
    assert.deepEqual(rejects, ['max'])
    assert.deepEqual([model.state.committed, model.state.preview, model.state.target], [1, 1, 1 / 3])
  }
})

test('an async commit is pending until it answers', async () => {
  let answer
  const { model, rejects } = harness({ answer: () => new Promise(resolve => { answer = resolve }) })
  model.jumpTo(2)
  assert.deepEqual([model.state.pending, model.state.preview, model.state.committed], [true, 2, 1])
  answer(false)
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual([model.state.pending, model.state.preview, model.state.committed], [false, 1, 1])
  assert.deepEqual(rejects, ['high'])
})

test('a newer gesture outranks an older answer', async () => {
  const answers = {}
  const { model, calls } = harness({ answer: id => new Promise(resolve => { answers[id] = resolve }) })
  model.jumpTo(2)
  model.jumpTo(3)
  answers.high(true)
  await Promise.resolve()
  await Promise.resolve()
  // The older answer counts as accepted but does not move the thumb.
  assert.deepEqual([model.state.committed, model.state.preview, model.state.pending], [2, 3, true])
  answers.max(false)
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual([model.state.committed, model.state.preview, model.state.pending], [2, 2, false])
  assert.deepEqual(calls, ['high', 'max'])
})

test('going back to the accepted level while a commit is open tells the host', async () => {
  let open
  const { model, calls } = harness({ answer: id => (id === 'max' ? new Promise(resolve => { open = resolve }) : true) })
  model.jumpTo(3)
  model.jumpTo(1)
  assert.deepEqual(calls, ['max', 'low'])
  open(true)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(model.state.preview, 1)
  assert.equal(model.state.pending, false)
})

test('a burst of key presses is one commit', () => {
  const { model, calls, runTimers } = harness()
  model.stepBy(1)
  model.stepBy(1)
  model.stepBy(-1)
  assert.deepEqual(calls, [])
  assert.equal(model.state.preview, 2)
  runTimers()
  assert.deepEqual(calls, ['high'])
  model.stepBy(5)
  assert.equal(model.state.preview, 3)
  model.flush()
  assert.deepEqual(calls, ['high', 'max'])
  runTimers()
  assert.deepEqual(calls, ['high', 'max'])
})

test('the host can move the value, but not out from under a drag', () => {
  const { model, calls } = harness()
  model.setValue('max')
  assert.deepEqual([model.state.committed, model.state.preview, model.state.target], [3, 3, 1])
  model.dragStart(0.5)
  model.setValue('off')
  assert.equal(model.state.dragging, true)
  assert.notEqual(model.state.target, 0)
  model.dragCancel()
  assert.deepEqual([model.state.preview, model.state.target], [0, 0])
  model.setValue('missing')
  assert.equal(model.state.committed, 0)
  assert.deepEqual(calls, [])
})

test('changing the scale keeps the selection when it still exists', () => {
  const { model } = harness()
  model.setLevels(normalizeLevels(LEVEL_SETS.penta))
  assert.equal(model.state.level.id, 'low')
  model.setLevels(normalizeLevels(LEVEL_SETS.binary))
  assert.equal(model.state.level.id, 'off')
  model.setLevels(normalizeLevels(LEVEL_SETS.triad), 'high')
  assert.deepEqual([model.state.level.id, model.state.target], ['high', 1])
})

test('a disabled slider ignores every gesture', () => {
  const { model, calls, runTimers } = harness()
  model.setDisabled(true)
  model.dragStart(0.9)
  model.dragEnd()
  model.stepBy(1)
  model.jumpTo(3)
  runTimers()
  assert.deepEqual(calls, [])
  assert.equal(model.state.preview, 1)
})

// ----------------------------------------------------------------- shaders

test('the shaders are complete GLSL ES 3.00 programs', () => {
  for (const source of [VERTEX, FIELD, BLUR, COMPOSITE]) {
    assert.ok(source.startsWith('#version 300 es'))
    assert.equal(source.split('{').length, source.split('}').length)
  }
  // The shader times each cell with the same constants as the CPU side.
  assert.match(FIELD, /u_timing/)
  // Motion that speeds up with effort reads the flow clock, never time * speed.
  assert.doesNotMatch(FIELD, /\bts\b/)
  assert.match(FIELD, /uniform float u_flow;/)
  // Off must leave the rail exactly empty: the 8-bit afterglow has to be able
  // to reach zero, and the dither must not paint an empty rail.
  assert.match(FIELD, /-vec2\(3\.0\/255\.0\)/)
  assert.match(COMPOSITE, /step\(0\.004,result\.a\)/)
  // Every mode a preset can name has a branch in the shader, in the same order.
  assert.deepEqual([...RENDER_MODES], [...MODES])
  for (const mode of MODES) assert.match(FIELD, new RegExp(`void ${mode}Mode\\(\\)`))
})

// ----------------------------------------------------------------- package

test('every export in package.json points at a real file', async () => {
  const manifest = JSON.parse(await readFile(root('package.json'), 'utf8'))
  assert.equal(manifest.version, '2.1.1')
  for (const target of Object.values(manifest.exports)) {
    const files = typeof target === 'string' ? [target] : Object.values(target)
    for (const file of files) await access(root(file.replace('./', '')))
  }
})

test('the handle survives being destructured', async () => {
  const source = await readFile(root('src/dom/slider.js'), 'utf8')
  assert.doesNotMatch(source, /this\.update|this\.destroy/u)
  assert.match(source, /setValue\(id\) \{\n\s*update\(\{ value: id \}\)\n\s*\}/u)
  assert.match(source, /^ {4}update,$/mu)
  assert.match(source, /^ {4}destroy,$/mu)
})

test('the core entry loads without a DOM', async () => {
  const core = await import('../src/core/index.js')
  assert.equal(typeof core.createSliderModel, 'function')
  assert.equal(globalThis.document, undefined)
})

test('the demo is one self-contained file', async () => {
  const html = await readFile(root('demo.html'), 'utf8')
  assert.ok(html.length < 200_000, 'stays small')
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=["']https?:/i)
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i)
  assert.match(html, /\.es-root\{/)
  assert.match(html, /#version 300 es/)
})
