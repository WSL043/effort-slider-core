/**
 * The slider's behaviour, with no DOM in it.
 *
 * A gesture previews locally and reports one selection when it ends:
 *
 *   drag ......... dragStart -> dragMove* -> dragEnd      one commit on release
 *   keyboard ..... stepBy* (a burst of key presses)       one commit when it pauses
 *   click/label .. jumpTo                                 one commit immediately
 *
 * `onCommit(id, level)` may return `false`, throw, or return a promise of
 * either; a refusal rolls the thumb back to the last accepted level. While a
 * promise is open the model is `pending`. If a newer gesture starts before an
 * older commit resolves, the older answer still updates what counts as
 * accepted but no longer moves the thumb.
 *
 * The model works controlled (the host calls `setValue` after accepting) and
 * uncontrolled (the host never calls it) alike.
 */
import { indexOfLevel, magnetize, ratioOfIndex, snapIndex } from './levels.js'

export function createSliderModel({
  levels = [],
  value,
  magnet = 0.5,
  keyDelay = 160,
  onState,
  onPreview,
  onCommit,
  onReject,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = handle => clearTimeout(handle),
} = {}) {
  let scale = levels
  let committed = Math.max(0, indexOfLevel(scale, value))
  let preview = committed
  let target = ratioOfIndex(scale.length, committed)
  let dragging = false
  let pending = false
  let disabled = false
  let token = 0
  let keyTimer = null
  let handlers = { onState, onPreview, onCommit, onReject }
  let magnetStrength = magnet

  const snapshot = () => ({
    target,
    preview,
    committed,
    dragging,
    pending,
    level: scale[preview],
  })
  const emit = reason => handlers.onState?.(snapshot(), reason)

  const setPreview = index => {
    if (index === preview) return
    preview = index
    handlers.onPreview?.(scale[index])
  }

  const cancelKeyTimer = () => {
    if (keyTimer === null) return
    clearTimer(keyTimer)
    keyTimer = null
  }

  const settle = (index, accepted, mine) => {
    if (accepted) committed = index
    if (mine !== token) return
    pending = false
    if (accepted) {
      emit('commit')
      return
    }
    if (!dragging) {
      setPreview(committed)
      target = ratioOfIndex(scale.length, committed)
    }
    handlers.onReject?.(scale[index])
    emit('reject')
  }

  const commit = (index, announce = true) => {
    cancelKeyTimer()
    setPreview(index)
    target = ratioOfIndex(scale.length, index)
    if (announce) emit('settle')
    // Re-selecting the accepted level is a no-op, unless another commit is
    // still in flight: then the host has to hear about the change of mind.
    if (index === committed && !pending) return
    token += 1
    const mine = token
    let result
    try {
      result = handlers.onCommit?.(scale[index].id, scale[index])
    } catch {
      settle(index, false, mine)
      return
    }
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      pending = true
      emit('pending')
      result.then(
        answer => settle(index, answer !== false, mine),
        () => settle(index, false, mine),
      )
      return
    }
    settle(index, result !== false, mine)
  }

  const usable = () => !disabled && scale.length > 1

  return {
    get state() {
      return snapshot()
    },

    /** Replace the scale. Keeps the selected id when it still exists. */
    setLevels(next, nextValue) {
      const keep = nextValue ?? scale[committed]?.id
      scale = next
      cancelKeyTimer()
      token += 1
      pending = false
      dragging = false
      committed = Math.max(0, indexOfLevel(scale, keep))
      preview = committed
      target = ratioOfIndex(scale.length, committed)
      emit('value')
    },

    /** The host's accepted value changed. */
    setValue(id) {
      const index = indexOfLevel(scale, id)
      if (index < 0 || index === committed) return
      committed = index
      if (dragging || pending || keyTimer !== null) return
      preview = committed
      target = ratioOfIndex(scale.length, committed)
      emit('value')
    },

    setDisabled(next) {
      disabled = Boolean(next)
      if (disabled && dragging) this.dragCancel()
    },

    setMagnet(next) {
      magnetStrength = Number.isFinite(next) ? next : magnetStrength
    },

    setHandlers(next) {
      handlers = { ...handlers, ...next }
    },

    dragStart(ratio) {
      if (!usable()) return
      cancelKeyTimer()
      dragging = true
      this.dragMove(ratio)
    },

    dragMove(ratio) {
      if (!dragging) return
      target = magnetize(ratio, scale.length, magnetStrength)
      setPreview(snapIndex(scale.length, ratio))
      emit('drag')
    },

    dragEnd() {
      if (!dragging) return
      dragging = false
      commit(preview)
    },

    dragCancel() {
      if (!dragging) return
      dragging = false
      setPreview(committed)
      target = ratioOfIndex(scale.length, committed)
      emit('cancel')
    },

    /** Keyboard step. Commits once the key presses pause. */
    stepBy(delta) {
      if (!usable() || dragging) return
      this.previewIndex(preview + delta)
    },

    /** Move the preview to an index and commit after the key delay. */
    previewIndex(index) {
      if (!usable() || dragging) return
      const bounded = Math.max(0, Math.min(scale.length - 1, index))
      cancelKeyTimer()
      setPreview(bounded)
      target = ratioOfIndex(scale.length, bounded)
      emit('settle')
      keyTimer = setTimer(() => {
        keyTimer = null
        commit(bounded, false)
      }, keyDelay)
    },

    /** Select an index now (label click, programmatic choice). */
    jumpTo(index) {
      if (!usable() || dragging) return
      commit(Math.max(0, Math.min(scale.length - 1, index)))
    },

    /** Commit a waiting keyboard step right away (blur, unmount). */
    flush() {
      if (keyTimer === null) return
      cancelKeyTimer()
      commit(preview, false)
    },

    destroy() {
      cancelKeyTimer()
      token += 1
      handlers = {}
    },
  }
}
