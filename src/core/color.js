/**
 * Colour maths for the palette ramps.
 *
 * Ramps are interpolated in OKLab, so a ramp from violet to pink passes
 * through clean intermediate colours instead of the grey dip that plain sRGB
 * mixing produces. Pure functions, no DOM.
 */

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i
const clamp01 = value => Math.max(0, Math.min(1, value))

export function isHex(value) {
  return typeof value === 'string' && HEX.test(value)
}

/** `#rrggbb` or `#rgb` to `[r, g, b]` in 0-1, or `null`. */
export function parseHex(value) {
  if (!isHex(value)) return null
  let digits = value.replace('#', '')
  if (digits.length === 3) digits = [...digits].map(digit => digit + digit).join('')
  return [0, 2, 4].map(start => Number.parseInt(digits.slice(start, start + 2), 16) / 255)
}

export function toHex(rgb) {
  return `#${rgb.map(channel => Math.round(clamp01(channel) * 255).toString(16).padStart(2, '0')).join('')}`
}

const toLinear = channel => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4))
const toGamma = channel => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055)

export function rgbToOklab([red, green, blue]) {
  const r = toLinear(red)
  const g = toLinear(green)
  const b = toLinear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToRgb([lightness, a, b]) {
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(channel => clamp01(toGamma(clamp01(channel))))
}

function oklchToHex(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180
  // Step chroma down until the colour fits sRGB, so hue and lightness survive.
  for (let c = chroma; c >= 0; c -= 0.004) {
    const lab = [lightness, c * Math.cos(hue), c * Math.sin(hue)]
    const l = Math.pow(lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2], 3)
    const m = Math.pow(lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2], 3)
    const s = Math.pow(lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2], 3)
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
    if (linear.every(channel => channel >= -0.0005 && channel <= 1.0005)) return toHex(oklabToRgb(lab))
  }
  return toHex(oklabToRgb([lightness, 0, 0]))
}

/** Colour at position `t` (0-1) along evenly spaced hex stops, as `[r, g, b]`. */
export function sampleRampRgb(stops, t) {
  const labs = stops.map(stop => rgbToOklab(parseHex(stop) ?? [0.5, 0.5, 0.5]))
  if (labs.length === 1) return oklabToRgb(labs[0])
  const scaled = clamp01(t) * (labs.length - 1)
  const left = Math.min(labs.length - 2, Math.floor(scaled))
  const progress = scaled - left
  return oklabToRgb(labs[left].map((channel, index) => channel + (labs[left + 1][index] - channel) * progress))
}

/** Same as `sampleRampRgb`, as a hex string. */
export function sampleRamp(stops, t) {
  return toHex(sampleRampRgb(stops, t))
}

/** RGBA bytes for a `size`x1 lookup texture. */
export function buildRampTexture(stops, size = 64) {
  const data = new Uint8Array(size * 4)
  for (let index = 0; index < size; index += 1) {
    const [red, green, blue] = sampleRampRgb(stops, index / (size - 1))
    data[index * 4] = Math.round(red * 255)
    data[index * 4 + 1] = Math.round(green * 255)
    data[index * 4 + 2] = Math.round(blue * 255)
    data[index * 4 + 3] = 255
  }
  return data
}

/** CSS gradient for the no-WebGL fill: cool at the start, hot at the thumb. */
export function rampGradient(stops, direction = 'to right', steps = 7) {
  const colors = Array.from({ length: steps }, (_, index) => sampleRamp(stops, index / (steps - 1)))
  return `linear-gradient(${direction}, ${colors.join(', ')})`
}

/** WCAG relative luminance of a hex colour. */
export function luminance(hex) {
  const [red, green, blue] = (parseHex(hex) ?? [0, 0, 0]).map(toLinear)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(first, second) {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Build a complete light and dark palette from one brand colour.
 *
 * Dark ramps climb toward white, because light adds up on a dark rail. Light
 * ramps climb toward a deep shade, because on a pale rail the hottest energy
 * has to be the most saturated ink, not the brightest. The hue drifts a
 * little along the ramp so the result does not look like a single flat tint.
 */
export function paletteFromAccent(accent) {
  const rgb = parseHex(accent)
  if (rgb === null) return null
  const [lightness, a, b] = rgbToOklab(rgb)
  const chroma = Math.max(0.04, Math.hypot(a, b))
  const hue = (Math.atan2(b, a) * 180) / Math.PI
  const neutral = Math.hypot(a, b) < 0.02
  const tint = neutral ? 0 : 1
  return {
    dark: {
      track: oklchToHex(0.165, 0.012 * tint, hue),
      ramp: [
        oklchToHex(0.34, Math.min(chroma, 0.15) * tint, hue + 16),
        oklchToHex(Math.max(0.58, Math.min(0.74, lightness)), chroma * tint, hue),
        oklchToHex(0.85, chroma * 0.7 * tint, hue - 20),
        oklchToHex(0.975, chroma * 0.16 * tint, hue - 28),
      ],
    },
    light: {
      track: oklchToHex(0.952, 0.006 * tint, hue),
      ramp: [
        oklchToHex(0.87, chroma * 0.42 * tint, hue + 10),
        oklchToHex(Math.max(0.5, Math.min(0.62, lightness)), chroma * tint, hue),
        oklchToHex(0.43, chroma * 0.95 * tint, hue - 10),
        oklchToHex(0.31, chroma * 0.8 * tint, hue - 16),
      ],
    },
  }
}
