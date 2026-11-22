/**
 * React wrapper. Written with createElement so the package ships plain
 * JavaScript and needs no JSX transform.
 *
 *   import { EffortSlider } from 'effort-slider-core/react'
 *
 *   <EffortSlider
 *     levels={['off', 'low', 'high', 'max']}
 *     value={effort}
 *     onChange={async id => { const ok = await save(id); if (ok) setEffort(id); return ok }}
 *     preset="flame"
 *   />
 *
 * Every option of createEffortSlider is a prop. `className`, `style` and `id`
 * go on the wrapper element.
 */
import { createElement, useEffect, useLayoutEffect, useRef } from 'react'

import { createEffortSlider } from './dom/slider.js'

const OPTION_KEYS = [
  'levels', 'value', 'preset', 'accent', 'colors', 'params', 'thumb', 'theme', 'size', 'labels',
  'render', 'motion', 'magnet', 'disabled', 'haptics', 'label', 'labelledBy', 'emptyText',
]

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function EffortSlider({ className, style, id, onChange, onInput, onReject, ...props }) {
  const hostRef = useRef(null)
  const sliderRef = useRef(null)
  const handlers = useRef({})
  handlers.current = { onChange, onInput, onReject }

  // A removed prop arrives as undefined; null tells the slider to restore the default.
  const options = {}
  for (const key of OPTION_KEYS) options[key] = props[key] ?? null
  if (props.value === undefined) delete options.value

  useIsomorphicLayoutEffect(() => {
    const slider = createEffortSlider(hostRef.current, {
      ...options,
      onChange: (...args) => handlers.current.onChange?.(...args),
      onInput: (...args) => handlers.current.onInput?.(...args),
      onReject: (...args) => handlers.current.onReject?.(...args),
    })
    sliderRef.current = slider
    return () => {
      slider.destroy()
      sliderRef.current = null
    }
  }, [])

  useIsomorphicLayoutEffect(() => {
    sliderRef.current?.update(options)
  })

  return createElement('div', { ref: hostRef, className, style, id })
}
