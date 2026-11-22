/**
 * effort-slider-core
 *
 * The default entry has no framework dependency:
 *   createEffortSlider   the control
 *   EnergyRenderer       draws the fire, for other surfaces
 *   createCombustion     the fire's timing on its own (no DOM)
 *   PRESETS, LEVEL_SETS  ready-made materials and scales
 *
 *   defineEffortSlider   registers the <effort-slider> custom element
 *
 * React users import from 'effort-slider-core/react'. Server code that only validates or
 * maps a saved level can import 'effort-slider-core/core', which never
 * touches the DOM.
 */
export { createEffortSlider } from './dom/slider.js'
export { defineEffortSlider } from './element.js'
export { CSS, injectStyles } from './dom/styles.js'
export { EnergyRenderer } from './render/renderer.js'

export * from './core/index.js'
