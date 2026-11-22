/**
 * A damped spring, stepped with fixed sub-steps so it stays stable whatever
 * the frame rate. The thumb rides one of these, and the renderer reads its
 * velocity, which is why the energy leans into a fast drag.
 */
export class Spring {
  constructor({ value = 0, stiffness = 420, damping = 30, mass = 1, precision = 0.0004 } = {}) {
    this.value = value
    this.target = value
    this.velocity = 0
    this.stiffness = stiffness
    this.damping = damping
    this.mass = mass
    this.precision = precision
  }

  /** Jump to a value with no motion. */
  snap(value) {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  get settled() {
    return Math.abs(this.target - this.value) < this.precision && Math.abs(this.velocity) < this.precision * 10
  }

  /** Advance by `dt` seconds. Returns the new value. */
  step(dt) {
    if (!(dt > 0)) return this.value
    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.1) / 0.004))
    const slice = Math.min(dt, 0.1) / steps
    for (let index = 0; index < steps; index += 1) {
      const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping
      this.velocity += (force / this.mass) * slice
      this.value += this.velocity * slice
    }
    if (this.settled) {
      this.value = this.target
      this.velocity = 0
    }
    return this.value
  }
}
