/**
 * EnergyRenderer: draws the rail's light into a canvas.
 *
 * It owns no clock. Each call to `render()` draws one frame from the state it
 * is given; the only thing it keeps between frames is the afterglow of the
 * last one. The same renderer can sit behind a slider, a progress bar, or a
 * "thinking" indicator.
 *
 *   const renderer = EnergyRenderer.create(canvas)   // null without WebGL2
 *   renderer.configure({ mode: 'fire', ramp: [...], dark: true, look: { rows: 6 } })
 *   renderer.resize(cssWidth, cssHeight)
 *   renderer.render({ time, dt, head, edge, level, charge, velocity, from, to, since, burst })
 */
import { TIMING } from '../core/combustion.js'
import { buildRampTexture } from '../core/color.js'
import { BLUR, COMPOSITE, FIELD, MODES, VERTEX } from './shaders.js'

const DEFAULT_LOOK = { rows: 6, fill: 0.72, flicker: 1, sparks: 1, persistence: 0.9, bloom: 1, threshold: 0.55, gain: 1 }

export class EnergyRenderer {
  /** A renderer for this canvas, or `null` when WebGL2 is not available. */
  static create(canvas, options) {
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      })
      return gl ? new EnergyRenderer(canvas, gl, options) : null
    } catch {
      return null
    }
  }

  constructor(canvas, gl, { maxPixelRatio = 2, onContextLost, onContextRestored } = {}) {
    this.canvas = canvas
    this.gl = gl
    this.maxPixelRatio = maxPixelRatio
    this.dark = true
    this.mode = 'fire'
    this.look = { ...DEFAULT_LOOK }
    this.rampStops = ['#2a1250', '#7a3bd6', '#a857f7', '#dcc4ff', '#fff7fd']
    this.lost = false
    this.cssWidth = 0
    this.cssHeight = 0
    this.time = 0
    this.seed = 0
    this.onLost = event => {
      event.preventDefault()
      this.lost = true
      onContextLost?.()
    }
    this.onRestored = () => {
      this.lost = false
      this.build()
      onContextRestored?.()
    }
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    this.build()
  }

  build() {
    const { gl } = this
    this.targets = null
    this.fresh = true
    this.field = this.program(FIELD, [
      'u_res', 'u_back', 'u_time', 'u_keep', 'u_head', 'u_edge', 'u_rows', 'u_seed', 'u_from', 'u_to',
      'u_since', 'u_level', 'u_charge', 'u_burst', 'u_vel', 'u_mode', 'u_p', 'u_timing',
    ])
    this.blur = this.program(BLUR, ['u_tex', 'u_step', 'u_threshold'])
    this.composite = this.program(COMPOSITE, ['u_scene', 'u_bloom', 'u_ramp', 'u_dark', 'u_bloomAmount', 'u_time'])
    this.vao = gl.createVertexArray()
    this.quad = gl.createBuffer()
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.rampTexture = gl.createTexture()
    this.uploadRamp()
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    if (this.cssWidth > 0) this.resize(this.cssWidth, this.cssHeight, true)
  }

  program(fragmentSource, uniformNames) {
    const { gl } = this
    const compile = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`Shader compile failed: ${log}`)
      }
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, 'a_position')
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Shader link failed: ${log}`)
    }
    const uniforms = {}
    for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name)
    return { program, uniforms }
  }

  uploadRamp() {
    const { gl } = this
    const size = 64
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildRampTexture(this.rampStops, size))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  /**
   * Change the look. Any subset of:
   *   mode    'fire' | 'synapse' | 'frost' | 'plankton'
   *   ramp    two or more hex colours, coldest first
   *   dark    true for a dark rail
   *   seed    a number; each value gives a different crowd of cells
   *   look    { rows, fill, flicker, sparks, persistence, bloom, threshold, gain }
   */
  configure({ mode, ramp, dark, seed, look } = {}) {
    if (MODES.includes(mode)) this.mode = mode
    if (typeof dark === 'boolean') this.dark = dark
    if (Number.isFinite(seed)) this.seed = seed
    if (look !== null && typeof look === 'object') this.look = { ...DEFAULT_LOOK, ...look }
    if (Array.isArray(ramp) && ramp.length >= 2 && ramp.join() !== this.rampStops.join()) {
      this.rampStops = [...ramp]
      if (!this.lost) this.uploadRamp()
    }
  }

  /** Forget the afterglow, so the next frame starts from a dark rail. */
  reset() {
    this.fresh = true
  }

  /** Make the canvas fully transparent now, and forget the afterglow. */
  clear() {
    if (this.lost || this.targets === null) return
    const { gl } = this
    gl.clearColor(0, 0, 0, 0)
    for (const target of [this.targets.scene, this.targets.last]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.fresh = true
  }

  target(width, height) {
    const { gl } = this
    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    return { texture, framebuffer, width, height }
  }

  releaseTargets() {
    if (this.targets === null) return
    for (const { texture, framebuffer } of Object.values(this.targets)) {
      this.gl.deleteTexture(texture)
      this.gl.deleteFramebuffer(framebuffer)
    }
    this.targets = null
  }

  /** Match the drawing buffer to the canvas's CSS size. */
  resize(cssWidth, cssHeight, force = false) {
    this.cssWidth = cssWidth
    this.cssHeight = cssHeight
    if (this.lost) return
    const ratio = Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio)
    const width = Math.max(2, Math.round(cssWidth * ratio))
    const height = Math.max(2, Math.round(cssHeight * ratio))
    if (!force && this.targets !== null && this.canvas.width === width && this.canvas.height === height) return
    this.canvas.width = width
    this.canvas.height = height
    this.releaseTargets()
    const halfWidth = Math.max(1, Math.round(width / 2))
    const halfHeight = Math.max(1, Math.round(height / 2))
    this.fresh = true
    this.targets = {
      scene: this.target(width, height),
      last: this.target(width, height),
      blurA: this.target(halfWidth, halfHeight),
      blurB: this.target(halfWidth, halfHeight),
    }
  }

  blurPass(source, destination, x, y, threshold) {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer)
    gl.viewport(0, 0, destination.width, destination.height)
    gl.bindTexture(gl.TEXTURE_2D, source.texture)
    gl.uniform2f(this.blur.uniforms.u_step, x / destination.width, y / destination.height)
    gl.uniform1f(this.blur.uniforms.u_threshold, threshold)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  /**
   * Draw a frame.
   *
   *   time     seconds of fire time (the caller decides how fast it runs)
   *   dt       seconds since the last frame; 0 draws with no afterglow
   *   head     thumb centre, CSS pixels from the start of the rail
   *   edge     half the thumb's width, CSS pixels
   *   level    0-1 effort intensity, for how vigorous the fire is
   *   charge   0-1, 1 while the person is acting
   *   velocity thumb speed in rail heights per second (stirs `plankton`)
   *   from, to, since   the current fire event (see core/combustion.js)
   *   burst    seconds since the last selection (large for none)
   */
  render({ time = 0, dt = 1 / 60, head = 0, edge = 0, level = 0, charge = 0, velocity = 0, from = 0, to = 0, since = 99, burst = 99 } = {}) {
    if (this.lost || this.targets === null) return
    const { gl, canvas, targets, look } = this
    const unit = this.cssHeight > 0 ? this.cssHeight : 1
    this.time = time
    const keep = this.fresh || !(dt > 0) ? 0 : Math.pow(look.persistence, dt * 60)
    this.fresh = false

    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)

    const field = this.field
    const u = field.uniforms
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.scene.framebuffer)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(field.program)
    gl.bindTexture(gl.TEXTURE_2D, targets.last.texture)
    gl.uniform1i(u.u_back, 0)
    gl.uniform2f(u.u_res, canvas.width, canvas.height)
    gl.uniform1f(u.u_time, time)
    gl.uniform1f(u.u_keep, keep)
    gl.uniform1f(u.u_head, head / unit)
    gl.uniform1f(u.u_edge, edge / unit)
    gl.uniform1f(u.u_rows, look.rows)
    gl.uniform1f(u.u_seed, this.seed)
    gl.uniform1f(u.u_from, from)
    gl.uniform1f(u.u_to, to)
    gl.uniform1f(u.u_since, since)
    gl.uniform1f(u.u_level, level)
    gl.uniform1f(u.u_charge, charge)
    gl.uniform1f(u.u_burst, burst)
    gl.uniform1f(u.u_vel, velocity)
    gl.uniform1f(u.u_mode, MODES.indexOf(this.mode))
    gl.uniform4f(u.u_p, look.flicker, look.sparks, look.fill, look.gain)
    gl.uniform4f(u.u_timing, TIMING.igniteDelay, TIMING.igniteDuration, TIMING.quenchDelay, TIMING.quenchDuration)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Glow from the hottest parts only, two blur rounds at half resolution.
    const radius = Math.max(1, targets.blurA.height * 0.05)
    gl.useProgram(this.blur.program)
    gl.uniform1i(this.blur.uniforms.u_tex, 0)
    this.blurPass(targets.scene, targets.blurA, radius, 0, look.threshold)
    this.blurPass(targets.blurA, targets.blurB, 0, radius, 0)
    this.blurPass(targets.blurB, targets.blurA, radius * 2.2, 0, 0)
    this.blurPass(targets.blurA, targets.blurB, 0, radius * 2.2, 0)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(this.composite.program)
    gl.bindTexture(gl.TEXTURE_2D, targets.scene.texture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, targets.blurB.texture)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.composite.uniforms.u_scene, 0)
    gl.uniform1i(this.composite.uniforms.u_bloom, 1)
    gl.uniform1i(this.composite.uniforms.u_ramp, 2)
    gl.uniform1f(this.composite.uniforms.u_dark, this.dark ? 1 : 0)
    gl.uniform1f(this.composite.uniforms.u_bloomAmount, look.bloom)
    gl.uniform1f(this.composite.uniforms.u_time, time)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // This frame becomes the afterglow of the next.
    const swap = targets.scene
    targets.scene = targets.last
    targets.last = swap
  }

  /** Release every GPU resource and the context itself. */
  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    if (this.lost) return
    const { gl } = this
    this.releaseTargets()
    for (const entry of [this.field, this.blur, this.composite]) gl.deleteProgram(entry.program)
    gl.deleteTexture(this.rampTexture)
    gl.deleteBuffer(this.quad)
    gl.deleteVertexArray(this.vao)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.lost = true
  }
}
