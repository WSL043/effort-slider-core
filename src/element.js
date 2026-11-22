/**
 * <effort-slider>: the control as a custom element, for pages with no
 * framework and for frameworks that prefer elements to imperative setup.
 *
 *   import { defineEffortSlider } from 'effort-slider-core/element'
 *   defineEffortSlider()
 *
 *   <effort-slider levels="off,low,high,max" value="high" preset="ember"></effort-slider>
 *
 * Attributes: levels (comma-separated ids), value, preset, accent, theme,
 * size, labels, render, motion, thumb, label, disabled.
 * Properties: `levels` (array, for names and hints), `value`, `options`
 * (any createEffortSlider option, including a custom preset object).
 * Events: `change` and `input`, both with `detail: { id, level }`. Calling
 * `preventDefault()` on `change` refuses the selection.
 *
 * The element renders in the light DOM so the page's fonts and colours apply.
 */
import { createEffortSlider } from './dom/slider.js'

const ATTRIBUTES = ['levels', 'value', 'preset', 'accent', 'theme', 'size', 'labels', 'render', 'motion', 'thumb', 'label', 'disabled']

export function defineEffortSlider(tagName = 'effort-slider') {
  const registry = globalThis.customElements
  if (registry === undefined) return undefined
  const existing = registry.get(tagName)
  if (existing !== undefined) return existing

  class EffortSliderElement extends globalThis.HTMLElement {
    static observedAttributes = ATTRIBUTES

    #slider = null
    #options = {}

    connectedCallback() {
      if (this.#slider !== null) return
      if (!this.style.display) this.style.display = 'block'
      this.#slider = createEffortSlider(this, {
        ...this.#fromAttributes(),
        ...this.#options,
        onChange: (id, level) => this.dispatchEvent(new CustomEvent('change', { detail: { id, level }, bubbles: true, cancelable: true })),
        onInput: (id, level) => { this.dispatchEvent(new CustomEvent('input', { detail: { id, level }, bubbles: true })) },
      })
    }

    disconnectedCallback() {
      this.#slider?.destroy()
      this.#slider = null
    }

    attributeChangedCallback(name) {
      const next = { ...this.#fromAttributes(), ...this.#options }
      // Only a change to the value attribute itself may move the thumb.
      if (name !== 'value') delete next.value
      else next.value = this.getAttribute('value') ?? undefined
      this.#slider?.update(next)
    }

    #fromAttributes() {
      const read = name => this.getAttribute(name) ?? null
      const levels = this.getAttribute('levels')
      return {
        levels: levels === null ? null : levels.split(',').map(entry => entry.trim()).filter(Boolean),
        value: this.getAttribute('value') ?? undefined,
        preset: read('preset'),
        accent: read('accent'),
        theme: read('theme'),
        size: read('size'),
        labels: read('labels'),
        render: read('render'),
        motion: read('motion'),
        thumb: read('thumb'),
        label: read('label'),
        disabled: this.hasAttribute('disabled'),
      }
    }

    get value() {
      return this.#slider?.value ?? this.getAttribute('value') ?? undefined
    }

    set value(id) {
      this.#options.value = id
      this.#slider?.update({ value: id })
    }

    get levels() {
      return this.#options.levels
    }

    set levels(levels) {
      this.options = { levels }
    }

    get options() {
      return { ...this.#options }
    }

    set options(next) {
      this.#options = { ...this.#options, ...next }
      this.#slider?.update(next)
    }
  }

  registry.define(tagName, EffortSliderElement)
  return EffortSliderElement
}
