import type { EffortSliderOptions, Level, LevelInput } from './index.js'

export interface EffortSliderElement extends HTMLElement {
  value: string | undefined
  levels: readonly LevelInput[] | undefined
  /** Any createEffortSlider option, merged over the attributes. */
  options: EffortSliderOptions
}

export interface EffortSliderEventDetail {
  id: string
  level: Level
}

/** Registers the element once and returns its class. */
export function defineEffortSlider(tagName?: string): CustomElementConstructor | undefined

declare global {
  interface HTMLElementTagNameMap {
    'effort-slider': EffortSliderElement
  }
}
