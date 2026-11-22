import { LEVEL_SETS, PRESETS, createEffortSlider } from '../src/index.js'

/** Tiny hyperscript helper: h('button', { class: 'x', onclick }, 'Label'). */
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value)
    else if (key === 'class') node.className = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false))
  return node
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const SCALES = [
  ['binary', 'On / off'],
  ['triad', 'Three steps'],
  ['quad', 'Four steps'],
  ['penta', 'Five steps'],
  ['budget', 'Token budget'],
]

const state = {
  theme: 'auto',
  preset: 'flame',
  scale: 'quad',
  size: 'lg',
  motion: 'auto',
  render: 'auto',
  accent: null,
  slowSave: false,
  refuseTop: false,
  value: 'high',
}

const resolvedTheme = () => (state.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : state.theme)

// ------------------------------------------------------------------ stage

const levelName = h('strong', { class: 'readout-name' })
const levelHint = h('span', { class: 'readout-hint' })
const saveStatus = h('span', { class: 'readout-status', role: 'status' })
const heroHost = h('div', { class: 'hero-host' })
const eventLog = h('ol', { class: 'log', 'aria-label': 'Calls the host received' })

function showLevel(level) {
  levelName.textContent = level.name
  levelHint.textContent = level.hint ?? ''
}

function logCall(text) {
  eventLog.prepend(h('li', {}, text))
  while (eventLog.children.length > 4) eventLog.lastChild.remove()
}

const hero = createEffortSlider(heroHost, {
  levels: LEVEL_SETS[state.scale],
  value: state.value,
  preset: state.preset,
  size: state.size,
  theme: resolvedTheme(),
  label: 'Reasoning effort',
  onInput: (id, level) => showLevel(level),
  onChange: async (id, level) => {
    const levels = LEVEL_SETS[state.scale]
    if (state.slowSave) {
      saveStatus.textContent = 'Saving…'
      await wait(900)
    }
    if (state.refuseTop && id === levels[levels.length - 1].id) {
      logCall(`onChange("${id}") returned false`)
      saveStatus.textContent = `The host refused ${level.name}. Rolled back.`
      showLevel(levels.find(entry => entry.id === state.value))
      return false
    }
    state.value = id
    logCall(`onChange("${id}") returned true`)
    saveStatus.textContent = 'Saved'
    renderSnippet()
    return true
  },
})

// --------------------------------------------------------------- controls

function segmented(label, entries, read, write) {
  const buttons = entries.map(([value, text]) => h('button', {
    type: 'button',
    'data-value': value,
    onclick: () => { write(value); sync() },
  }, text))
  const sync = () => buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === read())))
  sync()
  return h('div', { class: 'control' }, h('span', { class: 'control-label' }, label), h('div', { class: 'segmented', role: 'group', 'aria-label': label }, buttons))
}

function toggle(label, hint, read, write) {
  const input = h('input', { type: 'checkbox', onchange: event => write(event.currentTarget.checked) })
  input.checked = read()
  return h('label', { class: 'toggle' }, input, h('span', {}, h('b', {}, label), h('small', {}, hint)))
}

const accentInput = h('input', {
  type: 'color',
  value: '#e11d48',
  'aria-label': 'Brand colour',
  oninput: event => { state.accent = event.currentTarget.value; applyHero() },
})
const accentReset = h('button', {
  type: 'button',
  class: 'link',
  onclick: () => { state.accent = null; applyHero() },
}, 'Use the preset’s own colours')

function applyHero() {
  hero.update({
    preset: state.preset,
    accent: state.accent,
    size: state.size,
    motion: state.motion,
    render: state.render,
    theme: resolvedTheme(),
  })
  accentReset.hidden = state.accent === null
  renderSnippet()
}

function applyScale(scale) {
  const levels = LEVEL_SETS[scale]
  state.scale = scale
  // Keep the same relative position when the scale changes.
  const previous = LEVEL_SETS[state.previousScale ?? scale]
  const index = Math.max(0, previous.findIndex(level => level.id === state.value))
  const ratio = previous.length > 1 ? index / (previous.length - 1) : 0
  const next = levels[Math.round(ratio * (levels.length - 1))]
  state.previousScale = scale
  state.value = next.id
  hero.update({ levels, value: next.id })
  saveStatus.textContent = ''
  showLevel(next)
  renderSnippet()
}
state.previousScale = state.scale

const controls = h('div', { class: 'controls' },
  segmented('Scale', SCALES, () => state.scale, applyScale),
  segmented('Size', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']], () => state.size, value => { state.size = value; applyHero() }),
  segmented('Motion', [['auto', 'Follow system'], ['full', 'Always'], ['still', 'Still']], () => state.motion, value => { state.motion = value; applyHero() }),
  segmented('Drawing', [['auto', 'WebGL'], ['css', 'CSS only']], () => state.render, value => { state.render = value; applyHero() }),
  h('div', { class: 'control' },
    h('span', { class: 'control-label' }, 'One brand colour'),
    h('div', { class: 'accent' }, accentInput, accentReset),
  ),
  h('div', { class: 'control toggles' },
    toggle('Slow save', 'onChange takes 0.9 s to answer', () => state.slowSave, value => { state.slowSave = value }),
    toggle('Refuse the top level', 'onChange returns false', () => state.refuseTop, value => { state.refuseTop = value }),
  ),
)

// ---------------------------------------------------------------- gallery

const gallerySliders = []
const galleryCards = []
const GALLERY_VALUES = ['max', 'high', 'max', 'high', 'max']

const gallery = h('div', { class: 'gallery' }, Object.values(PRESETS).map((preset, index) => {
  const host = h('div', { class: 'preset-host' })
  const use = h('button', {
    type: 'button',
    class: 'use',
    onclick: () => {
      state.preset = preset.id
      state.accent = null
      applyHero()
      syncGallery()
      document.querySelector('.stage').scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  })
  const card = h('article', { class: 'preset', 'data-preset': preset.id },
    h('div', { class: 'preset-head' }, h('h3', {}, preset.name), use),
    h('p', { class: 'phenomenon' }, preset.phenomenon),
    h('p', {}, preset.description),
    host,
  )
  galleryCards.push({ card, use, id: preset.id })
  gallerySliders.push(createEffortSlider(host, {
    levels: LEVEL_SETS.quad,
    value: GALLERY_VALUES[index % GALLERY_VALUES.length],
    preset: preset.id,
    theme: resolvedTheme(),
    label: `${preset.name} preset`,
  }))
  return card
}))

function syncGallery() {
  for (const { card, use, id } of galleryCards) {
    const current = id === state.preset && state.accent === null
    card.toggleAttribute('data-current', current)
    use.textContent = current ? 'On the stage' : 'Put on the stage'
    use.disabled = current
  }
}

// ---------------------------------------------------------------- snippet

const snippet = h('code', {})
const copyButton = h('button', {
  type: 'button',
  class: 'copy',
  onclick: async () => {
    try {
      await navigator.clipboard.writeText(snippet.textContent)
      copyButton.textContent = 'Copied'
    } catch {
      copyButton.textContent = 'Select the text to copy'
    }
    setTimeout(() => { copyButton.textContent = 'Copy' }, 1600)
  },
}, 'Copy')

function renderSnippet() {
  const lines = [
    `  levels: LEVEL_SETS.${state.scale},`,
    `  value: '${state.value}',`,
    `  preset: '${state.preset}',`,
    state.accent === null ? null : `  accent: '${state.accent}',`,
    state.size === 'md' ? null : `  size: '${state.size}',`,
    state.motion === 'auto' ? null : `  motion: '${state.motion}',`,
    state.render === 'auto' ? null : `  render: '${state.render}',`,
    '  onChange: async (id, level) => {',
    '    // Called once per gesture. Return false (or throw) to roll back.',
    '    return saveEffort(id)',
    '  },',
  ].filter(line => line !== null)
  snippet.textContent = [
    "import { createEffortSlider, LEVEL_SETS } from 'effort-slider-core'",
    '',
    "createEffortSlider(document.querySelector('#effort'), {",
    ...lines,
    '})',
  ].join('\n')
}

// ------------------------------------------------------------------- page

function applyTheme() {
  const theme = resolvedTheme()
  document.documentElement.dataset.theme = theme
  hero.update({ theme })
  for (const slider of gallerySliders) slider.update({ theme })
}
darkQuery.addEventListener('change', applyTheme)

document.getElementById('app').append(
  h('header', { class: 'top' },
    h('span', { class: 'mark' }, 'effort-slider-core', h('small', {}, '2.1.1')),
    segmented('Theme', [['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']], () => state.theme, value => { state.theme = value; applyTheme() }),
  ),
  h('main', {},
    h('section', { class: 'intro' },
      h('h1', {}, 'A slider for how hard the model thinks.'),
      h('p', {}, 'Drag it, click a level, or use the arrow keys. Each choice lights a fire that catches cell by cell: a smoulder at the low end, the whole rail ablaze at the top. Lower it and the fire goes out, leaving embers.'),
    ),
    h('section', { class: 'stage', 'aria-label': 'Live slider' },
      h('div', { class: 'readout' },
        h('div', { class: 'readout-level' }, levelName, levelHint),
        saveStatus,
      ),
      heroHost,
      eventLog,
    ),
    h('section', { class: 'panel', 'aria-label': 'Options for the live slider' }, controls),
    h('section', { class: 'presets' },
      h('h2', {}, 'Presets'),
      h('p', { class: 'section-lede' }, 'Every preset keeps the same rules: light is an event, each cell is an individual, the front is the most alive part, the source has a pulse, colour is temperature. What changes is the phenomenon they are read through. Each one wakes as it scrolls into view; try moving the plankton.'),
      gallery,
    ),
    h('section', { class: 'usage' },
      h('h2', {}, 'The code for the slider on the stage'),
      h('div', { class: 'snippet' }, copyButton, h('pre', {}, snippet)),
    ),
  ),
  h('footer', {}, h('p', {}, 'No server, no account, no telemetry. MIT licensed.')),
)

showLevel(LEVEL_SETS[state.scale].find(level => level.id === state.value))
accentReset.hidden = true
renderSnippet()
syncGallery()
applyTheme()
