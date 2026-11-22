/**
 * Combustion: when and how far the fire burns.
 *
 * The fire is an event, not a pattern. Choosing a level is a moment: the fire
 * catches and runs back along the rail, or it recedes and goes out. Each cell
 * of the rail catches (or goes out) on its own time, so the front is ragged
 * and alive, and the crowd of cells is what draws its shape.
 *
 * This file is the clock of those events, with no DOM and no GPU. The shader
 * (render/shaders.js) uses the same timing per cell; `meanExtent` here is the
 * same curve for an average cell, used to start a new event from wherever the
 * fire is when the person changes their mind mid-way.
 *
 * Extent is a fraction (0-1) of the filled part of the rail, the part behind
 * the thumb. Effort is extent: a smoulder at the thumb at the low end, the
 * whole filled rail at the top.
 */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

/** Timing shared with the shader. Each cell scales these by its own hash h. */
export const TIMING = Object.freeze({
  /** A catching cell waits up to this long before its front starts. */
  igniteDelay: 0.9,
  /** Seconds for an average cell's front to run its course when catching. */
  igniteDuration: 2.2,
  /** A dying cell waits up to this long before it goes out. */
  quenchDelay: 0.45,
  /** Seconds for an average cell's front to recede when going out. */
  quenchDuration: 0.9,
})

/** How far the fire reaches at a level intensity (0-1). */
export function extentOf(intensity, reach = 1) {
  if (!(intensity > 0.001)) return 0
  return clamp((0.12 + 0.88 * Math.pow(clamp(intensity, 0, 1), 1.1)) * reach, 0, 1)
}

const easeIgnite = k => 1 - Math.pow(1 - k, 3)
const easeQuench = k => k * k * (3 - 2 * k)

/** Extent of a cell with hash `h`, `since` seconds into an event. */
export function cellExtent(from, to, since, h = 0.5) {
  const grow = to >= from
  const delay = grow ? h * TIMING.igniteDelay : (1 - h) * TIMING.quenchDelay
  const duration = (grow ? TIMING.igniteDuration : TIMING.quenchDuration) / (0.85 + 0.3 * h)
  const k = clamp((since - delay) / duration, 0, 1)
  return from + (to - from) * (grow ? easeIgnite(k) : easeQuench(k))
}

/** Seconds until every cell of an event has finished. */
export function eventLength(from, to) {
  return to >= from
    ? TIMING.igniteDelay + TIMING.igniteDuration / 0.85
    : TIMING.quenchDelay + TIMING.quenchDuration / 0.85
}

/**
 * The state of one rail's fire.
 *
 *   const fire = createCombustion()
 *   fire.target(level.intensity)    // a level was chosen
 *   fire.advance(dt)                // every frame
 *   fire.from, fire.to, fire.since  // what the shader needs
 */
export function createCombustion({ reach = 1 } = {}) {
  let from = 0
  let to = 0
  let since = 0
  let scale = reach

  return {
    get from() {
      return from
    },
    get to() {
      return to
    },
    get since() {
      return since
    },
    /** True while cells are still catching, receding, or cooling as embers. */
    get changing() {
      return since < eventLength(from, to) + 2.5
    },
    /** True while there is any fire to draw. */
    get burning() {
      return to > 0 || this.changing
    },

    /** Where an average cell is now. */
    meanExtent() {
      return cellExtent(from, to, since)
    },

    setReach(next) {
      if (Number.isFinite(next) && next > 0) scale = next
    },

    /**
     * Aim the fire at a level. Starting from where it is now, so a change of
     * mind mid-way turns the fire around instead of jumping.
     */
    target(intensity) {
      const next = extentOf(intensity, scale)
      if (Math.abs(next - to) < 0.0005) return false
      from = this.meanExtent()
      to = next
      since = 0
      return true
    },

    /** Jump straight to a level with no event (initial paint, still mode). */
    settle(intensity) {
      to = extentOf(intensity, scale)
      from = to
      since = eventLength(to, to) + 10
    },

    advance(dt) {
      if (dt > 0) since += dt
    },
  }
}
