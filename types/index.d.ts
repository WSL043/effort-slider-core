/** A level as the caller writes it: an id, or an object with any extra fields. */
export type LevelInput = string | {
  id: string
  name?: string
  /** One-line promise shown as a tooltip and read to screen readers. */
  hint?: string
  /** 0-1 strength of the energy at this level. Defaults to an eased curve. */
  intensity?: number
  [extra: string]: unknown
}

/** A level after `normalizeLevels`. */
export interface Level {
  readonly id: string
  readonly name: string
  readonly hint?: string
  readonly index: number
  /** 0-1 position on the rail. */
  readonly ratio: number
  readonly intensity: number
  readonly [extra: string]: unknown
}

/** The phenomenon a preset draws. */
export type Mode = 'fire' | 'synapse' | 'frost' | 'plankton'
export type ThumbShape = 'pill' | 'orb' | 'block' | 'bar'

export interface ThemePalette {
  /** Rail colour, `#rrggbb`. */
  track: string
  /** Two or more hex colours, coldest first, hottest last. */
  ramp: readonly string[]
}

export interface PresetParams {
  /** How far the light runs at each level; 1 reaches the whole rail at the top. */
  reach: number
  /** Cells across the rail. */
  rows: number
  /** How much of its cell a lit square covers. */
  fill: number
  /** 0-2: how hard the light shimmers. */
  flicker: number
  /** 0-3: how many sparks run along each row (fire). */
  sparks: number
  /** 0-0.97: how much of each frame lingers into the next. */
  persistence: number
  /** Glow around the hottest cells. */
  bloom: number
  /** How hot a cell must be to glow. */
  threshold: number
  /** Overall brightness. */
  gain: number
  /** Light cast outside the rail by the rail and thumb. */
  glow: number
  /** Time scale. */
  speed: number
}

export interface Preset {
  id: string
  name: string
  /** The natural phenomenon, in a few words. */
  phenomenon?: string
  description?: string
  mode: Mode
  thumb: ThumbShape
  params: PresetParams
  dark: ThemePalette
  light: ThemePalette
}

/** A custom preset. Anything left out comes from `extends` (default 'flame'). */
export interface PresetInput {
  id?: string
  name?: string
  extends?: PresetId
  mode?: Mode
  thumb?: ThumbShape
  params?: Partial<PresetParams>
  dark?: Partial<ThemePalette>
  light?: Partial<ThemePalette>
}

export type PresetId = 'flame' | 'ember' | 'synapse' | 'frost' | 'plankton'

/** Answer to a commit. `false`, a rejection, or a throw rolls the thumb back. */
export type CommitResult = boolean | void | Promise<boolean | void>

export interface EffortSliderOptions {
  /** The scale, lowest first. Default `LEVEL_SETS.quad`. */
  levels?: readonly LevelInput[] | null
  /** Id of the selected level. */
  value?: string
  /** A built-in preset id or a custom preset object. Default 'flame'. */
  preset?: PresetId | PresetInput | (string & {}) | null
  /** One brand colour; a full light and dark palette is derived from it. */
  accent?: string | null
  /** Replace individual palette entries. Applied after `accent`. */
  colors?: { dark?: Partial<ThemePalette>; light?: Partial<ThemePalette> } | null
  /** Tune the preset's fire. */
  params?: Partial<PresetParams> | null
  thumb?: ThumbShape | null
  /** 'auto' follows `prefers-color-scheme`. */
  theme?: 'auto' | 'light' | 'dark' | null
  size?: 'sm' | 'md' | 'lg' | null
  /** Where the level names go. */
  labels?: 'top' | 'bottom' | 'none' | null
  /** 'auto' uses WebGL2 when available; 'css' never creates a canvas context. */
  render?: 'auto' | 'css' | null
  /** 'auto' follows `prefers-reduced-motion`; 'still' draws single frames. */
  motion?: 'auto' | 'full' | 'still' | null
  /** 0-1 stickiness of the stops while dragging. Default 0.5. */
  magnet?: number | null
  disabled?: boolean | null
  /** Vibrate briefly when a drag crosses a stop, where supported. */
  haptics?: boolean | null
  /** Accessible name. Default 'Reasoning effort'. */
  label?: string | null
  /** Id of an element that names the slider; replaces `label`. */
  labelledBy?: string | null
  emptyText?: string | null
  /** Called once per gesture with the chosen level. */
  onChange?: ((id: string, level: Level) => CommitResult) | null
  /** Called whenever the previewed level changes, including mid-drag. */
  onInput?: ((id: string, level: Level) => void) | null
  /** Called after a refused commit has rolled back. */
  onReject?: ((id: string, level: Level) => void) | null
}

export interface EffortSliderHandle {
  readonly element: HTMLDivElement
  /** Id of the accepted level. */
  readonly value: string | undefined
  /** `undefined` leaves an option alone; `null` restores its default. */
  update(options: EffortSliderOptions): void
  setValue(id: string): void
  destroy(): void
}

export function createEffortSlider(host: Element, options?: EffortSliderOptions): EffortSliderHandle
export function defineEffortSlider(tagName?: string): CustomElementConstructor | undefined

export const CSS: string
export function injectStyles(target?: Document | ShadowRoot): void

// ------------------------------------------------------------------ renderer

/** One frame of the rail's light. */
export interface FireFrame {
  /** Seconds since the light started, for steady motions. */
  time?: number
  /** The tempo clock from `Combustion.flow`. It must never jump. */
  flow?: number
  /** The current tempo, `tempoOf(level, charge)`. */
  tempo?: number
  /** Seconds since the last frame; 0 draws with no afterglow. */
  dt?: number
  /** Thumb centre, CSS pixels from the start of the rail. */
  head?: number
  /** Half the thumb's width, CSS pixels. */
  edge?: number
  /** 0-1 effort intensity: how vigorous the fire is. */
  level?: number
  /** 0-1, 1 while the person is acting. */
  charge?: number
  /** Thumb speed in rail heights per second; stirs `plankton`. */
  velocity?: number
  /** The current fire event, from a `Combustion`. */
  from?: number
  to?: number
  since?: number
  /** Seconds since the last selection. */
  burst?: number
}

export class EnergyRenderer {
  /** `null` when WebGL2 is unavailable. */
  static create(canvas: HTMLCanvasElement, options?: {
    maxPixelRatio?: number
    onContextLost?: () => void
    onContextRestored?: () => void
  }): EnergyRenderer | null
  configure(look: {
    mode?: Mode
    ramp?: readonly string[]
    dark?: boolean
    seed?: number
    look?: Partial<Pick<PresetParams, 'rows' | 'fill' | 'flicker' | 'sparks' | 'persistence' | 'bloom' | 'threshold' | 'gain'>>
  }): void
  resize(cssWidth: number, cssHeight: number): void
  /** Forget the afterglow. */
  reset(): void
  /** Make the canvas fully transparent now. */
  clear(): void
  render(frame?: FireFrame): void
  dispose(): void
}

/** The clock of the fire's events: catching, receding, going out. */
export interface Combustion {
  readonly from: number
  readonly to: number
  readonly since: number
  /** The integrated tempo clock: never jumps when the tempo changes. */
  readonly flow: number
  /** True while cells are still catching, receding, or cooling. */
  readonly changing: boolean
  /** True while there is any fire to draw. */
  readonly burning: boolean
  meanExtent(): number
  setReach(reach: number): void
  /** Aim the fire at a level intensity. Returns false if nothing changes. */
  target(intensity: number): boolean
  /** Jump to a level with no event. */
  settle(intensity: number): void
  /** Advance by `dt` seconds at `tempo` (from `tempoOf`). */
  advance(dt: number, tempo?: number): void
}

export function createCombustion(options?: { reach?: number }): Combustion
/** How far the fire reaches (0-1 of the filled rail) at a level intensity. */
export function extentOf(intensity: number, reach?: number): number
/** Extent of a cell with hash `h`, `since` seconds into an event. */
/** How fast the light lives at an intensity, with the person acting (charge 1) or not. */
export function tempoOf(intensity: number, charge?: number): number
export function cellExtent(from: number, to: number, since: number, h?: number): number
/** Seconds until every cell of an event has finished. */
export function eventLength(from: number, to: number): number
export const TIMING: Readonly<{ igniteDelay: number; igniteDuration: number; quenchDelay: number; quenchDuration: number }>

// ---------------------------------------------------------------------- core

export const LEVEL_SETS: Readonly<Record<'binary' | 'triad' | 'quad' | 'penta' | 'budget', readonly Readonly<Exclude<LevelInput, string>>[]>>
export const PRESETS: Readonly<Record<PresetId, Readonly<Preset>>>
export const DEFAULT_PRESET: PresetId
export const MODES: readonly Mode[]
export const PARAM_DEFAULTS: Readonly<PresetParams>
export const THUMBS: readonly ThumbShape[]

export function normalizeLevels(input: unknown): Level[]
export function defaultIntensity(ratio: number): number
export function indexOfLevel(levels: readonly Level[], id: string | undefined): number
export function snapIndex(count: number, ratio: number): number
export function ratioOfIndex(count: number, index: number): number
export function intensityAt(levels: readonly Level[], ratio: number): number
export function magnetize(ratio: number, count: number, strength?: number): number

export function resolvePreset(
  input?: PresetId | PresetInput | string | null,
  overrides?: Pick<EffortSliderOptions, 'accent' | 'colors' | 'params' | 'thumb'>,
): Omit<Preset, 'description' | 'phenomenon'>

export function isHex(value: unknown): value is string
export function parseHex(value: unknown): [number, number, number] | null
export function toHex(rgb: readonly number[]): string
export function sampleRamp(stops: readonly string[], t: number): string
export function rampGradient(stops: readonly string[], direction?: string, steps?: number): string
export function buildRampTexture(stops: readonly string[], size?: number): Uint8Array
export function luminance(hex: string): number
export function contrast(first: string, second: string): number
export function paletteFromAccent(accent: unknown): { dark: ThemePalette; light: ThemePalette } | null

export interface SliderModelState {
  /** 0-1 position the thumb is heading for. */
  target: number
  /** Index of the level the gesture is currently on. */
  preview: number
  /** Index of the last accepted level. */
  committed: number
  dragging: boolean
  pending: boolean
  level: Level | undefined
}

export type SliderModelReason = 'drag' | 'settle' | 'pending' | 'commit' | 'reject' | 'cancel' | 'value'

export interface SliderModel {
  readonly state: SliderModelState
  setLevels(levels: readonly Level[], value?: string): void
  setValue(id: string): void
  setDisabled(disabled: boolean): void
  setMagnet(strength: number): void
  setHandlers(handlers: Partial<Pick<SliderModelOptions, 'onState' | 'onPreview' | 'onCommit' | 'onReject'>>): void
  dragStart(ratio: number): void
  dragMove(ratio: number): void
  dragEnd(): void
  dragCancel(): void
  stepBy(delta: number): void
  previewIndex(index: number): void
  jumpTo(index: number): void
  flush(): void
  destroy(): void
}

export interface SliderModelOptions {
  levels?: readonly Level[]
  value?: string
  magnet?: number
  /** Milliseconds a keyboard step waits for another before committing. */
  keyDelay?: number
  onState?: (state: SliderModelState, reason: SliderModelReason) => void
  onPreview?: (level: Level) => void
  onCommit?: (id: string, level: Level) => CommitResult
  onReject?: (level: Level) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: any) => void
}

export function createSliderModel(options?: SliderModelOptions): SliderModel

export class Spring {
  constructor(options?: { value?: number; stiffness?: number; damping?: number; mass?: number; precision?: number })
  value: number
  target: number
  velocity: number
  stiffness: number
  damping: number
  readonly settled: boolean
  snap(value: number): void
  step(dt: number): number
}
