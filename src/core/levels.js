/**
 * Effort levels: the ordered scale the slider moves along.
 *
 * Pure functions only. Nothing here touches the DOM, so the same code can run
 * in a browser, a Node test, or on the server that validates a saved setting.
 */

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Visual intensity for a level that does not declare its own.
 * Eased so the middle of the scale stays visibly calmer than the top: effort
 * should read as "a little, some, a lot", not as three equal steps.
 */
export function defaultIntensity(ratio) {
  const bounded = clamp01(ratio)
  return bounded <= 0 ? 0 : Math.pow(bounded, 1.5)
}

/**
 * Turn caller input into the level list the slider works with.
 *
 * Accepts `'low'` or `{ id, name?, hint?, intensity?, ...anything }`. Entries
 * without an id and repeated ids are dropped. Fewer than two usable levels
 * cannot form a scale, so the result is an empty list and the caller shows
 * its empty state.
 *
 * Each returned level is frozen and carries `index`, `ratio` (0-1 position on
 * the rail) and `intensity` (0-1 strength of the energy at that level). Extra
 * fields such as a token budget pass through untouched.
 */
export function normalizeLevels(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const usable = []
  for (const entry of input) {
    let level
    if (typeof entry === 'string' && entry.length > 0) {
      level = { id: entry, name: capitalize(entry) }
    } else if (entry !== null && typeof entry === 'object' && typeof entry.id === 'string' && entry.id.length > 0) {
      const name = typeof entry.name === 'string' && entry.name.length > 0 ? entry.name : capitalize(entry.id)
      level = { ...entry, name }
    } else {
      continue
    }
    if (seen.has(level.id)) continue
    seen.add(level.id)
    usable.push(level)
  }
  if (usable.length < 2) return []
  const last = usable.length - 1
  return usable.map((level, index) => {
    const ratio = index / last
    const intensity = Number.isFinite(level.intensity) ? clamp01(level.intensity) : defaultIntensity(ratio)
    return Object.freeze({ ...level, index, ratio, intensity })
  })
}

/** Index of the level with this id, or -1. */
export function indexOfLevel(levels, id) {
  return Array.isArray(levels) ? levels.findIndex(level => level.id === id) : -1
}

/** Nearest level index for a 0-1 rail position. */
export function snapIndex(count, ratio) {
  if (!(count > 1)) return 0
  return Math.round(clamp01(ratio) * (count - 1))
}

/** Rail position (0-1) of a level index. */
export function ratioOfIndex(count, index) {
  if (!(count > 1)) return 0
  return Math.max(0, Math.min(count - 1, index)) / (count - 1)
}

/**
 * Energy intensity at any rail position, interpolated between the two
 * neighbouring levels. This is what makes the energy swell continuously while
 * the thumb is dragged instead of jumping at each stop.
 */
export function intensityAt(levels, ratio) {
  if (!Array.isArray(levels) || levels.length < 2) return 0
  const scaled = clamp01(ratio) * (levels.length - 1)
  const left = Math.min(levels.length - 2, Math.floor(scaled))
  const progress = scaled - left
  return levels[left].intensity + (levels[left + 1].intensity - levels[left].intensity) * progress
}

/**
 * Pull a rail position toward the nearest level, without ever leaving the
 * pointer behind: the mapping is continuous and monotonic, it only spends more
 * of the travel near each stop. `strength` 0 is a plain linear rail, 1 is a
 * very sticky one.
 */
export function magnetize(ratio, count, strength = 0.5) {
  const bounded = clamp01(ratio)
  if (!(count > 1) || !(strength > 0)) return bounded
  const scaled = bounded * (count - 1)
  const nearest = Math.round(scaled)
  const offset = scaled - nearest
  const curved = Math.sign(offset) * 0.5 * Math.pow(Math.abs(offset) * 2, 1 + Math.min(1, strength) * 2)
  return (nearest + curved) / (count - 1)
}

const set = entries => Object.freeze(entries.map(entry => Object.freeze(entry)))

/**
 * Ready-made scales. Use one as-is, or as a starting point: the `hint` is the
 * one-line promise shown to the person, and any extra field (such as
 * `budgetTokens`) is yours to read back in `onChange`.
 */
export const LEVEL_SETS = Object.freeze({
  /** Thinking on or off. */
  binary: set([
    { id: 'off', name: 'Off', hint: 'Answers straight away' },
    { id: 'on', name: 'On', hint: 'Thinks before answering' },
  ]),
  /** The common three-step effort enum. */
  triad: set([
    { id: 'low', name: 'Low', hint: 'Quick answers, light checking' },
    { id: 'medium', name: 'Medium', hint: 'Balanced speed and care' },
    { id: 'high', name: 'High', hint: 'Works through the problem' },
  ]),
  /** Off plus three strengths. The v1 default. */
  quad: set([
    { id: 'off', name: 'Off', hint: 'Answers straight away' },
    { id: 'low', name: 'Low', hint: 'A brief check before answering' },
    { id: 'high', name: 'High', hint: 'Works through the problem' },
    { id: 'max', name: 'Max', hint: 'Takes as long as it needs' },
  ]),
  /** Five steps, for tools that expose the whole range. */
  penta: set([
    { id: 'minimal', name: 'Minimal', hint: 'Fastest, no deliberate reasoning' },
    { id: 'low', name: 'Low', hint: 'A brief check before answering' },
    { id: 'medium', name: 'Medium', hint: 'Balanced speed and care' },
    { id: 'high', name: 'High', hint: 'Works through the problem' },
    { id: 'max', name: 'Max', hint: 'Takes as long as it needs' },
  ]),
  /** Thinking-token budgets. Budgets double, so intensity follows the log. */
  budget: set([
    { id: 'off', name: 'Off', hint: 'No thinking budget', budgetTokens: 0, intensity: 0 },
    { id: '2k', name: '2k', hint: 'Up to 2,000 thinking tokens', budgetTokens: 2000, intensity: 0.14 },
    { id: '8k', name: '8k', hint: 'Up to 8,000 thinking tokens', budgetTokens: 8000, intensity: 0.34 },
    { id: '16k', name: '16k', hint: 'Up to 16,000 thinking tokens', budgetTokens: 16000, intensity: 0.56 },
    { id: '32k', name: '32k', hint: 'Up to 32,000 thinking tokens', budgetTokens: 32000, intensity: 0.78 },
    { id: '64k', name: '64k', hint: 'Up to 64,000 thinking tokens', budgetTokens: 64000, intensity: 1 },
  ]),
})
