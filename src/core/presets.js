/**
 * Presets: complete looks for the slider.
 *
 * Every preset keeps the same rules (docs/DESIGN.md): the light is an event,
 * every cell is an individual, the front is the most alive part, the source
 * has a pulse, colour is temperature, light lingers. What a preset chooses is
 * the phenomenon those rules are read through, and its material.
 *
 * A preset is data:
 *
 *   mode     'fire'     the rail catches and burns
 *            'synapse'  the source beats; each beat finds its own path
 *            'frost'    cold spreads, cells freeze into crystals that glint
 *            'plankton' dark water that lights only where it is disturbed
 *   thumb    'pill' | 'orb' | 'block' | 'bar'
 *   params   reach        how far the light runs at each level (1 = whole rail at the top)
 *            rows         cells across the rail
 *            fill         how much of its cell a lit square covers
 *            flicker      how hard the light shimmers (0-2)
 *            sparks       how many sparks run along each row (fire, 0-3)
 *            persistence  how much of each frame lingers into the next (0-0.97)
 *            bloom        glow around the hottest cells
 *            threshold    how hot a cell must be to glow
 *            gain         overall brightness
 *            glow         light cast outside the rail by the rail and thumb
 *            speed        time scale
 *   dark / light
 *            track       rail colour
 *            ramp        2 or more colours, coldest first, hottest last.
 *                        On dark rails the hottest should be near white;
 *                        on light rails it should be a deep shade.
 */
import { isHex, paletteFromAccent } from './color.js'

export const MODES = Object.freeze(['fire', 'synapse', 'frost', 'plankton'])

export const THUMBS = Object.freeze(['pill', 'orb', 'block', 'bar'])

export const PARAM_DEFAULTS = Object.freeze({
  reach: 1, rows: 6, fill: 0.72, flicker: 1, sparks: 1, persistence: 0.87,
  bloom: 1, threshold: 0.55, gain: 1, glow: 0.6, speed: 1,
})

/** Accepted range for each parameter. Values outside are clamped. */
const PARAM_RANGES = Object.freeze({
  reach: [0.2, 1.5], rows: [3, 12], fill: [0.3, 1], flicker: [0, 2], sparks: [0, 3], persistence: [0, 0.97],
  bloom: [0, 3], threshold: [0, 1.5], gain: [0.2, 3], glow: [0, 2], speed: [0.1, 3],
})

const define = preset => Object.freeze({
  ...preset,
  params: Object.freeze({ ...PARAM_DEFAULTS, ...preset.params }),
  dark: Object.freeze({ track: preset.dark.track, ramp: Object.freeze([...preset.dark.ramp]) }),
  light: Object.freeze({ track: preset.light.track, ramp: Object.freeze([...preset.light.ramp]) }),
})

export const PRESETS = Object.freeze({
  flame: define({
    id: 'flame',
    name: 'Flame',
    phenomenon: 'Fire',
    description: 'The rail catches cell by cell, white at the source and violet as it cools. The default.',
    mode: 'fire',
    thumb: 'pill',
    params: {},
    dark: { track: '#0c0c0e', ramp: ['#2a1250', '#7a3bd6', '#a857f7', '#dcc4ff', '#fff7fd'] },
    light: { track: '#ecebf0', ramp: ['#d9c8f7', '#a57ae9', '#7c3fd8', '#5a22b0', '#3a1078'] },
  }),
  ember: define({
    id: 'ember',
    name: 'Ember',
    phenomenon: 'Coals',
    description: 'The same fire burning low and warm: larger cells, slower, longer afterglow.',
    mode: 'fire',
    thumb: 'pill',
    params: { rows: 5, flicker: 0.8, sparks: 1.7, persistence: 0.93, speed: 0.75, bloom: 1.15 },
    dark: { track: '#0f0b0a', ramp: ['#3a0c04', '#9c2a0c', '#e8621f', '#ffb45e', '#fff1d8'] },
    light: { track: '#efebe8', ramp: ['#f2c4a4', '#e07a3e', '#c24b14', '#8f2c06', '#561602'] },
  }),
  synapse: define({
    id: 'synapse',
    name: 'Synapse',
    phenomenon: 'Nerve signals',
    description: 'The source beats, and each beat finds its own path through the cells. More effort, more beats, further.',
    mode: 'synapse',
    thumb: 'orb',
    params: { rows: 7, fill: 0.62, persistence: 0.84, bloom: 1.2, threshold: 0.45 },
    dark: { track: '#0a0b12', ramp: ['#14204f', '#2f55d8', '#5fa8ff', '#c9e4ff', '#ffffff'] },
    light: { track: '#e9ebf3', ramp: ['#c3cff5', '#6f8fe8', '#2f55d8', '#1b3496', '#0e1d5c'] },
  }),
  frost: define({
    id: 'frost',
    name: 'Frost',
    phenomenon: 'Freezing',
    description: 'Cold spreads from the thumb and the cells freeze one by one, then hold still and glint.',
    mode: 'frost',
    thumb: 'block',
    params: { rows: 6, fill: 0.78, flicker: 1, persistence: 0.92, bloom: 0.9, threshold: 0.6, speed: 0.9 },
    dark: { track: '#0b0e12', ramp: ['#11304a', '#3d7fb0', '#9cd2f0', '#e4f6ff', '#ffffff'] },
    light: { track: '#e8eef2', ramp: ['#bfdcec', '#6fb0d6', '#2f7fb0', '#165781', '#0a3352'] },
  }),
  plankton: define({
    id: 'plankton',
    name: 'Plankton',
    phenomenon: 'Bioluminescence',
    description: 'Dark water that lights only where it is stirred: by the thumb, by a swell from the source, by a choice.',
    mode: 'plankton',
    thumb: 'orb',
    params: { rows: 6, fill: 0.7, persistence: 0.95, bloom: 1.3, threshold: 0.4 },
    dark: { track: '#070d0e', ramp: ['#06323a', '#0f8c8c', '#3fe0c8', '#c4fff2', '#ffffff'] },
    light: { track: '#e7efee', ramp: ['#b2e3db', '#4fbfb0', '#138a82', '#0b5d59', '#063a38'] },
  }),
})

export const DEFAULT_PRESET = 'flame'

const cleanRamp = (ramp, fallback) => {
  if (!Array.isArray(ramp)) return fallback
  const stops = ramp.filter(isHex)
  return stops.length >= 2 ? stops : fallback
}

const cleanTheme = (theme, fallback) => ({
  track: isHex(theme?.track) ? theme.track : fallback.track,
  ramp: cleanRamp(theme?.ramp, fallback.ramp),
})

const cleanParams = (params, fallback) => {
  const result = { ...fallback }
  if (params === null || typeof params !== 'object') return result
  for (const [key, [low, high]] of Object.entries(PARAM_RANGES)) {
    if (Number.isFinite(params[key])) result[key] = Math.max(low, Math.min(high, params[key]))
  }
  return result
}

/**
 * Resolve whatever the caller passed into a complete preset.
 *
 *   resolvePreset('ember')
 *   resolvePreset({ extends: 'flame', dark: { ramp: ['#024', '#0cf', '#fff'] } })
 *   resolvePreset('flame', { accent: '#e11d48' })        one brand colour
 *   resolvePreset('flame', { params: { sparks: 2 } })    tune it
 *
 * Unknown ids and malformed fields fall back to the default preset, so a
 * saved setting from an older version can never break the control.
 */
export function resolvePreset(input, overrides = {}) {
  const fromId = typeof input === 'string' ? PRESETS[input] : undefined
  const custom = input !== null && typeof input === 'object' ? input : undefined
  const base = fromId ?? (custom && PRESETS[custom.extends]) ?? PRESETS[DEFAULT_PRESET]
  const source = custom ?? base

  let dark = cleanTheme(source.dark, base.dark)
  let light = cleanTheme(source.light, base.light)
  const accentPalette = paletteFromAccent(overrides.accent)
  if (accentPalette !== null) {
    dark = accentPalette.dark
    light = accentPalette.light
  }
  if (overrides.colors !== null && typeof overrides.colors === 'object') {
    dark = cleanTheme(overrides.colors.dark, dark)
    light = cleanTheme(overrides.colors.light, light)
  }

  return {
    id: typeof source.id === 'string' ? source.id : 'custom',
    name: typeof source.name === 'string' ? source.name : 'Custom',
    mode: MODES.includes(source.mode) ? source.mode : base.mode,
    thumb: THUMBS.includes(overrides.thumb) ? overrides.thumb : THUMBS.includes(source.thumb) ? source.thumb : base.thumb,
    params: cleanParams(overrides.params, cleanParams(source.params, base.params)),
    dark,
    light,
  }
}
