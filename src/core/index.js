/** Everything that runs without a DOM: scales, colour, presets, behaviour, fire timing. */
export {
  LEVEL_SETS,
  defaultIntensity,
  indexOfLevel,
  intensityAt,
  magnetize,
  normalizeLevels,
  ratioOfIndex,
  snapIndex,
} from './levels.js'
export {
  buildRampTexture,
  contrast,
  isHex,
  luminance,
  paletteFromAccent,
  parseHex,
  rampGradient,
  sampleRamp,
  toHex,
} from './color.js'
export { DEFAULT_PRESET, MODES, PARAM_DEFAULTS, PRESETS, THUMBS, resolvePreset } from './presets.js'
export { TIMING, cellExtent, createCombustion, eventLength, extentOf } from './combustion.js'
export { createSliderModel } from './model.js'
export { Spring } from './spring.js'
