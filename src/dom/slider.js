/**
 * createEffortSlider: the control itself, with no framework.
 *
 *   const slider = createEffortSlider(document.querySelector('#effort'), {
 *     levels: ['off', 'low', 'high', 'max'],
 *     value: 'high',
 *     preset: 'flame',
 *     onChange: id => save(id),   // may return false or a promise of false
 *   })
 *   slider.update({ value: 'max' })
 *   slider.destroy()
 *
 * This file is the glue: it builds the DOM, feeds pointer and key events to
 * the model (core/model.js), moves the thumb on a spring, and hands the
 * renderer one frame of state at a time. The React wrapper and the custom
 * element are thin shells around it.
 */
import { rampGradient, sampleRamp } from '../core/color.js'
import { LEVEL_SETS, intensityAt, normalizeLevels } from '../core/levels.js'
import { createSliderModel } from '../core/model.js'
import { resolvePreset } from '../core/presets.js'
import { Spring } from '../core/spring.js'
import { createCombustion, tempoOf } from '../core/combustion.js'
import { EnergyRenderer } from '../render/renderer.js'
import { injectStyles } from './styles.js'

const SETTLE_MS = 700
const TOP_SETTLE_MS = 1900
const STILL_CHARGE = 0.3
const STILL_TIME = 3.7

const DEFAULTS = {
  levels: LEVEL_SETS.quad,
  value: undefined,
  preset: 'flame',
  accent: undefined,
  colors: undefined,
  params: undefined,
  thumb: undefined,
  theme: 'auto',
  size: 'md',
  labels: 'top',
  render: 'auto',
  motion: 'auto',
  magnet: 0.5,
  disabled: false,
  haptics: false,
  label: 'Reasoning effort',
  labelledBy: undefined,
  emptyText: 'No effort levels are available.',
  onChange: undefined,
  onInput: undefined,
  onReject: undefined,
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
let instances = 0

export function createEffortSlider(host, initial = {}) {
  if (host === null || host === undefined) throw new TypeError('createEffortSlider needs a host element')
  const doc = host.ownerDocument
  const win = doc.defaultView
  injectStyles(doc)

  const options = { ...DEFAULTS }
  const seed = (instances += 1) * 7.31
  const el = (tag, className) => {
    const node = doc.createElement(tag)
    node.className = className
    return node
  }

  const root = el('div', 'es-root')
  const labelRow = el('div', 'es-labels')
  const track = el('div', 'es-track')
  const clip = el('div', 'es-clip')
  const fill = el('div', 'es-fill')
  let canvas = el('canvas', 'es-energy')
  const tickRow = el('div', 'es-ticks')
  const thumb = el('div', 'es-thumb')
  const empty = el('div', 'es-empty')
  labelRow.setAttribute('aria-hidden', 'true')
  canvas.setAttribute('aria-hidden', 'true')
  track.setAttribute('role', 'slider')
  track.setAttribute('aria-orientation', 'horizontal')
  track.tabIndex = 0
  clip.append(fill, canvas, tickRow)
  track.append(clip, thumb)
  root.append(labelRow, track, empty)
  host.appendChild(root)

  let levels = []
  let preset = resolvePreset(options.preset)
  let dark = true
  let still = false
  let rtl = false
  let renderer = null
  let webglFailed = false
  let width = 0
  let height = 0
  let visible = true
  let destroyed = false
  let raf = 0
  let lastFrame = 0
  let charge = 0
  let squash = 0
  let settleUntil = 0
  let fireTime = 0
  let burstAge = 99
  let pointerId = null
  let rejectTimer = 0
  let paintedIntensity = -1
  let paintedGlow = -1
  let paintedPassed = -1
  let labelNodes = []
  let tickNodes = []
  let valueChanged = true
  let shownLabel = -1
  const signatures = { levels: '', look: '', static: '' }
  const spring = new Spring()
  const fire = createCombustion()

  const wake = () => {
    if (raf === 0 && visible && !destroyed) raf = win.requestAnimationFrame(frame)
  }

  // Distance from each end of the rail to the thumb's centre at that end.
  // Mirrors --es-inset in the stylesheet.
  const inset = () => (preset.thumb === 'bar' ? 5 : height / 2)
  const thumbHalf = () => (preset.thumb === 'bar' ? 3.5 : Math.max(0, height / 2 - 1))
  const headAt = ratio => inset() + (width - 2 * inset()) * ratio

  const model = createSliderModel({
    setTimer: (callback, ms) => win.setTimeout(callback, ms),
    clearTimer: handle => win.clearTimeout(handle),
    onCommit: (id, level) => options.onChange?.(id, level),
    onReject: level => options.onReject?.(level.id, level),
    onPreview: level => {
      if (options.haptics && model.state.dragging) win.navigator.vibrate?.(6)
      options.onInput?.(level.id, level)
    },
    onState: (state, reason) => {
      syncState(state)
      const now = win.performance.now()
      if (reason === 'settle' || reason === 'reject' || reason === 'value') {
        const atTop = state.preview === levels.length - 1
        settleUntil = now + (atTop ? TOP_SETTLE_MS : SETTLE_MS)
      }
      // The fire follows the level the gesture is on: it catches and runs
      // when that goes up, and recedes when it goes down.
      if (state.level !== undefined) {
        if (still) fire.settle(state.level.intensity)
        else fire.target(state.level.intensity)
      }
      if (reason === 'settle' && !still && (state.level?.intensity ?? 0) > 0) burstAge = 0
      if (reason === 'reject') {
        root.toggleAttribute('data-rejected', true)
        win.clearTimeout(rejectTimer)
        rejectTimer = win.setTimeout(() => root.removeAttribute('data-rejected'), 400)
      }
      wake()
    },
  })

  function syncState(state) {
    const level = state.level
    root.toggleAttribute('data-dragging', state.dragging)
    root.toggleAttribute('data-pending', state.pending)
    track.setAttribute('aria-valuenow', String(state.preview))
    if (level !== undefined) track.setAttribute('aria-valuetext', level.hint ? `${level.name}, ${level.hint}` : level.name)
    if (state.pending) track.setAttribute('aria-busy', 'true')
    else track.removeAttribute('aria-busy')
    labelNodes.forEach((node, index) => node.classList.toggle('is-current', index === state.preview))
    // The new level's name rises into place, as part of the same moment.
    if (state.preview !== shownLabel) {
      const node = labelNodes[state.preview]
      if (node !== undefined && shownLabel !== -1) {
        node.classList.remove('is-arriving')
        void node.offsetWidth
        node.classList.add('is-arriving')
      }
      shownLabel = state.preview
    }
  }

  function buildScale() {
    labelRow.replaceChildren()
    tickRow.replaceChildren()
    labelNodes = levels.map(level => {
      const node = el('button', 'es-label')
      node.type = 'button'
      node.tabIndex = -1
      node.textContent = level.name
      if (level.hint) node.title = level.hint
      node.style.setProperty('--es-at', String(level.ratio))
      node.addEventListener('click', () => model.jumpTo(level.index))
      labelRow.appendChild(node)
      return node
    })
    shownLabel = -1
    tickNodes = levels.map(level => {
      const node = el('i', 'es-tick')
      node.style.setProperty('--es-at', String(level.ratio))
      tickRow.appendChild(node)
      return node
    })
    root.style.setProperty('--es-count', String(Math.max(1, levels.length)))
    root.toggleAttribute('data-empty', levels.length < 2)
    track.setAttribute('aria-valuemin', '0')
    track.setAttribute('aria-valuemax', String(Math.max(0, levels.length - 1)))
    paintedPassed = -1
  }

  function resolveDark() {
    if (options.theme === 'dark') return true
    if (options.theme === 'light') return false
    return darkQuery?.matches ?? true
  }

  function resolveStill() {
    if (options.motion === 'still') return true
    if (options.motion === 'full') return false
    return motionQuery?.matches ?? false
  }

  function stopRenderer() {
    if (renderer === null) return
    renderer.dispose()
    renderer = null
    // A disposed context cannot be revived, so a later renderer needs a new canvas.
    const fresh = el('canvas', 'es-energy')
    fresh.setAttribute('aria-hidden', 'true')
    canvas.replaceWith(fresh)
    canvas = fresh
  }

  function failWebgl() {
    webglFailed = true
    stopRenderer()
    root.dataset.render = 'css'
  }

  function syncRenderer() {
    const wanted = options.render !== 'css' && !webglFailed && levels.length > 1
    if (!wanted) {
      stopRenderer()
    } else if (renderer === null) {
      renderer = EnergyRenderer.create(canvas, {
        onContextLost: () => { root.dataset.render = 'css' },
        onContextRestored: () => { root.dataset.render = 'webgl'; wake() },
      })
      if (renderer === null) webglFailed = true
      else if (width > 0) renderer.resize(width, height)
    }
    root.dataset.render = renderer === null ? 'css' : 'webgl'
    const theme = dark ? preset.dark : preset.light
    const { params } = preset
    fire.setReach(params.reach)
    renderer?.configure({
      mode: preset.mode,
      ramp: theme.ramp,
      dark,
      seed: seed % 97,
      look: {
        rows: params.rows, fill: params.fill, flicker: params.flicker, sparks: params.sparks,
        persistence: params.persistence, bloom: params.bloom, threshold: params.threshold, gain: params.gain,
      },
    })
  }

  function paintLook() {
    const theme = dark ? preset.dark : preset.light
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.thumb = preset.thumb
    root.dataset.preset = preset.id
    root.style.setProperty('--es-track', theme.track)
    root.style.setProperty('--es-on-track', dark ? '#ffffff' : '#000000')
    root.style.setProperty('--es-ambient', String(preset.params.glow))
    root.style.setProperty('--es-gradient', rampGradient(theme.ramp, rtl ? 'to left' : 'to right'))
    paintedGlow = -1
    paintedIntensity = -1
    syncRenderer()
  }

  /** Apply `options` to the DOM. Each block skips itself when nothing changed. */
  function apply() {
    const nextLevels = normalizeLevels(options.levels)
    const levelSignature = JSON.stringify(nextLevels.map(level => [level.id, level.name, level.hint, level.intensity]))
    if (levelSignature !== signatures.levels) {
      signatures.levels = levelSignature
      levels = nextLevels
      buildScale()
      model.setLevels(levels, valueChanged ? options.value : undefined)
      spring.snap(model.state.target)
    } else if (valueChanged && options.value !== undefined) {
      model.setValue(options.value)
    }
    valueChanged = false
    model.setMagnet(options.magnet)
    model.setDisabled(options.disabled)

    const staticSignature = [options.size, options.labels, options.disabled, options.label, options.labelledBy, options.emptyText].join('|')
    if (staticSignature !== signatures.static) {
      signatures.static = staticSignature
      root.dataset.size = ['sm', 'md', 'lg'].includes(options.size) ? options.size : 'md'
      root.dataset.labels = ['top', 'bottom', 'none'].includes(options.labels) ? options.labels : 'top'
      root.toggleAttribute('data-disabled', Boolean(options.disabled))
      track.tabIndex = options.disabled ? -1 : 0
      if (options.disabled) track.setAttribute('aria-disabled', 'true')
      else track.removeAttribute('aria-disabled')
      if (options.labelledBy) {
        track.setAttribute('aria-labelledby', options.labelledBy)
        track.removeAttribute('aria-label')
      } else {
        track.setAttribute('aria-label', options.label)
        track.removeAttribute('aria-labelledby')
      }
      empty.textContent = options.emptyText
    }

    const nextDark = resolveDark()
    const nextStill = resolveStill()
    const lookSignature = JSON.stringify([options.preset, options.accent, options.colors, options.params, options.thumb, options.render, nextDark, levels.length > 1])
    if (lookSignature !== signatures.look || nextStill !== still) {
      signatures.look = lookSignature
      dark = nextDark
      still = nextStill
      preset = resolvePreset(options.preset, options)
      paintLook()
    }
    syncDirection()
    syncState(model.state)
    wake()
  }

  function layout(ratio, level) {
    const x = headAt(ratio)
    const shown = rtl ? width - x : x
    thumb.style.transform = `translate3d(${shown.toFixed(2)}px,-50%,0) translateX(-50%) scale(${(1 + squash * 0.1).toFixed(3)},${(1 - squash * 0.06).toFixed(3)})`
    if (renderer === null) fill.style.width = `${Math.max(0, x).toFixed(1)}px`
    if (Math.abs(level - paintedIntensity) > 0.004) {
      paintedIntensity = level
      root.style.setProperty('--es-intensity', level.toFixed(3))
    }
    if (Math.abs(level - paintedGlow) > 0.02) {
      paintedGlow = level
      root.style.setProperty('--es-glow', sampleRamp((dark ? preset.dark : preset.light).ramp, dark ? 0.3 + 0.45 * level : 0.35 + 0.5 * level))
    }
    let passed = 0
    for (const entry of levels) if (entry.ratio <= ratio + 0.001) passed += 1
    if (passed !== paintedPassed) {
      paintedPassed = passed
      tickNodes.forEach((node, index) => node.classList.toggle('is-passed', index < passed))
    }
    return x
  }

  function frame(now) {
    raf = 0
    if (destroyed || levels.length < 2 || width === 0) return
    const state = model.state
    const acting = state.dragging || state.pending || now < settleUntil
    const dt = lastFrame === 0 ? 1 / 60 : Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now

    if (still) {
      spring.snap(state.target)
      charge = STILL_CHARGE
      squash = 0
    } else {
      spring.stiffness = state.dragging ? 900 : 380
      spring.damping = state.dragging ? 60 : 27
      spring.target = state.target
      spring.step(dt)
      const goal = acting ? 1 : 0
      charge += (goal - charge) * (1 - Math.exp(-dt * (goal > charge ? 12 : 1.5)))
      if (goal === 0 && charge < 0.002) charge = 0
      squash += (clamp(Math.abs(spring.velocity) * 0.35, 0, 1) - squash) * Math.min(1, dt * 18)
      if (squash < 0.001) squash = 0
    }

    const ratio = clamp(spring.value, -0.012, 1.012)
    const level = intensityAt(levels, ratio)
    const head = layout(ratio, level)

    if (renderer !== null) {
      const tempo = tempoOf(level, charge)
      if (!still) {
        const scaled = dt * preset.params.speed
        fire.advance(scaled, tempo)
        fireTime += scaled
        burstAge += scaled
      }
      try {
        renderer.render({
          time: still ? STILL_TIME + seed : fireTime,
          flow: still ? STILL_TIME + seed : fire.flow,
          tempo,
          dt: still ? 0 : dt,
          head,
          edge: thumbHalf(),
          level,
          charge,
          velocity: still ? 0 : spring.velocity * Math.max(0, width - 2 * inset()) / Math.max(1, height),
          from: fire.from,
          to: fire.to,
          since: fire.since,
          burst: still ? 99 : burstAge,
        })
      } catch (error) {
        win.console?.warn?.('[effort-slider] WebGL rendering failed; using the CSS fill.', error)
        failWebgl()
        fill.style.width = `${Math.max(0, head).toFixed(1)}px`
      }
    }

    const moving = acting || !spring.settled || spring.value !== state.target || charge > 0 || squash > 0
    const alive = renderer !== null && fire.burning
    if (!still && (moving || alive)) wake()
    else {
      lastFrame = 0
      // Nothing is burning any more: leave the rail exactly empty.
      if (renderer !== null && !still && fire.to === 0) renderer.clear()
    }
  }

  // ---------------------------------------------------------------- input

  const ratioFromEvent = event => {
    const rect = track.getBoundingClientRect()
    const travel = Math.max(1, rect.width - 2 * inset())
    const raw = (event.clientX - rect.left - inset()) / travel
    return clamp(rtl ? 1 - raw : raw, 0, 1)
  }

  const onPointerDown = event => {
    if (event.button !== 0 || options.disabled || levels.length < 2) return
    pointerId = event.pointerId
    syncDirection()
    try { track.setPointerCapture(pointerId) } catch { /* synthetic events have no capture */ }
    track.focus({ preventScroll: true })
    model.dragStart(ratioFromEvent(event))
    event.preventDefault()
  }
  const onPointerMove = event => {
    if (event.pointerId === pointerId) model.dragMove(ratioFromEvent(event))
  }
  const onPointerUp = event => {
    if (event.pointerId !== pointerId) return
    pointerId = null
    model.dragEnd()
  }
  const onPointerCancel = event => {
    if (event.pointerId !== pointerId) return
    pointerId = null
    model.dragCancel()
  }
  const onKeyDown = event => {
    if (options.disabled || event.altKey || event.ctrlKey || event.metaKey) return
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
    const { preview } = model.state
    let next
    if (event.key === forward || event.key === 'ArrowUp' || event.key === 'PageUp') next = preview + 1
    else if (event.key === backward || event.key === 'ArrowDown' || event.key === 'PageDown') next = preview - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = levels.length - 1
    else return
    event.preventDefault()
    model.previewIndex(next)
  }
  const onBlur = () => model.flush()

  track.addEventListener('pointerdown', onPointerDown)
  track.addEventListener('pointermove', onPointerMove)
  track.addEventListener('pointerup', onPointerUp)
  track.addEventListener('pointercancel', onPointerCancel)
  track.addEventListener('lostpointercapture', onPointerCancel)
  track.addEventListener('keydown', onKeyDown)
  track.addEventListener('blur', onBlur)

  // ---------------------------------------------------------- environment

  const darkQuery = win.matchMedia?.('(prefers-color-scheme: dark)')
  const motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)')
  const onEnvironment = () => apply()
  darkQuery?.addEventListener?.('change', onEnvironment)
  motionQuery?.addEventListener?.('change', onEnvironment)

  const resizeObserver = typeof win.ResizeObserver === 'function'
    ? new win.ResizeObserver(() => measure())
    : null
  // Text direction is inherited, and nothing announces a change to it, so it
  // is re-read whenever the slider is measured, updated, or grabbed.
  function syncDirection() {
    const nextRtl = win.getComputedStyle(root).direction === 'rtl'
    if (nextRtl === rtl) return
    rtl = nextRtl
    root.toggleAttribute('data-rtl', rtl)
    paintLook()
  }

  function measure() {
    const rect = track.getBoundingClientRect()
    syncDirection()
    width = rect.width
    height = rect.height
    if (width > 0) {
      renderer?.resize(width, height)
    }
    lastFrame = 0
    wake()
  }
  resizeObserver?.observe(track)

  const intersectionObserver = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting
      lastFrame = 0
      wake()
    })
    : null
  intersectionObserver?.observe(root)

  // `undefined` leaves an option alone; `null` puts its default back.
  const merge = next => {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || !(key in DEFAULTS)) continue
      options[key] = value === null ? DEFAULTS[key] : value
    }
  }

  merge(initial)
  apply()
  measure()

  // Kept as closures rather than methods, so a handle can be destructured
  // (`const { setValue } = slider`) without losing its receiver.
  /**
   * Change any options. Unchanged options cost nothing. A key set to
   * `undefined` is ignored; set it to `null` to restore its default.
   */
  const update = (next = {}) => {
    if (destroyed) return
    // Only an explicit value moves the thumb; other updates leave an
    // uncontrolled selection where the person put it.
    valueChanged = typeof next.value === 'string'
    merge(next)
    apply()
  }

  const destroy = () => {
    if (destroyed) return
    model.flush()
    destroyed = true
    win.cancelAnimationFrame(raf)
    win.clearTimeout(rejectTimer)
    model.destroy()
    resizeObserver?.disconnect()
    intersectionObserver?.disconnect()
    darkQuery?.removeEventListener?.('change', onEnvironment)
    motionQuery?.removeEventListener?.('change', onEnvironment)
    stopRenderer()
    root.remove()
  }

  return {
    /** The slider's root element. */
    element: root,

    /** Id of the accepted level. */
    get value() {
      return levels[model.state.committed]?.id
    },

    update,

    /** Shorthand for `update({ value })`. */
    setValue(id) {
      update({ value: id })
    },

    destroy,
  }
}
