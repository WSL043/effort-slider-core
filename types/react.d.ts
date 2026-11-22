import type { CSSProperties, ReactElement } from 'react'
import type { EffortSliderOptions } from './index.js'

export interface EffortSliderProps extends EffortSliderOptions {
  className?: string
  style?: CSSProperties
  id?: string
}

export function EffortSlider(props: EffortSliderProps): ReactElement
