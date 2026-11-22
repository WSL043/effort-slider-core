/**
 * Component stylesheet.
 *
 * Every class is namespaced `es-`. Text inherits the host's font and colour,
 * so labels match whatever panel the slider sits in. The few values a host
 * may want to override are custom properties on `.es-root`:
 *
 *   --es-h        rail height           --es-radius   rail corner radius
 *   --es-font     label font size       --es-gap      space between labels and rail
 *
 * The component sets these inline and they should be left alone:
 *   --es-track, --es-gradient, --es-on-track, --es-glow, --es-intensity, --es-ambient
 */
export const CSS = String.raw`
.es-root{--es-h:28px;--es-inset:calc(var(--es-h)/2);--es-radius:9px;--es-font:11px;--es-gap:6px;--es-track:#111015;--es-on-track:#fff;--es-glow:#9a4cf5;--es-intensity:0;--es-ambient:1;display:flex;flex-direction:column;gap:var(--es-gap);min-width:0;font-size:var(--es-font);line-height:1.35;-webkit-tap-highlight-color:transparent}
.es-root[data-size=sm]{--es-h:22px;--es-radius:7px;--es-font:10px;--es-gap:5px}
.es-root[data-size=lg]{--es-h:40px;--es-radius:13px;--es-font:13px;--es-gap:9px}
.es-root[data-thumb=orb]{--es-radius:calc(var(--es-h)/2)}
.es-root[data-thumb=block]{--es-radius:4px}
.es-root[data-thumb=bar]{--es-radius:5px;--es-inset:5px}
.es-root[data-labels=bottom]{flex-direction:column-reverse}
.es-root[data-labels=none] .es-labels,.es-root[data-empty] .es-labels,.es-root[data-empty] .es-track,.es-root:not([data-empty]) .es-empty{display:none}
.es-empty{opacity:.6}

.es-labels{position:relative;height:1.35em}
.es-label{position:absolute;top:0;inset-inline-start:calc(var(--es-inset) + (100% - 2*var(--es-inset))*var(--es-at));translate:-50%;max-width:calc(100%/var(--es-count));margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:500;opacity:.5;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .15s ease}
.es-root[data-rtl] .es-label{translate:50%}
.es-label:first-child{inset-inline-start:0;translate:none}
.es-label:last-child{inset-inline-start:auto;inset-inline-end:0;translate:none}
.es-label:hover{opacity:.8}
.es-label.is-current{opacity:1;font-weight:650;text-shadow:0 0 calc(var(--es-intensity)*var(--es-ambient)*14px) color-mix(in srgb,var(--es-glow) calc(var(--es-intensity)*80%),transparent)}
.es-label.is-arriving{animation:es-arrive .42s cubic-bezier(.33,1,.68,1)}
@keyframes es-arrive{from{transform:translateY(55%);opacity:.2}to{transform:none;opacity:1}}
.es-root[data-disabled] .es-label{cursor:default}

.es-track{position:relative;box-sizing:border-box;height:var(--es-h);border-radius:var(--es-radius);background:var(--es-track);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--es-on-track) 10%,transparent),0 0 calc(var(--es-intensity)*var(--es-ambient)*22px) color-mix(in srgb,var(--es-glow) calc(var(--es-intensity)*var(--es-ambient)*28%),transparent);cursor:pointer;outline:none;touch-action:pan-y;user-select:none;-webkit-user-select:none;isolation:isolate}
.es-track:focus-visible{outline:2px solid color-mix(in srgb,var(--es-glow) 75%,currentColor);outline-offset:3px}
.es-root[data-dragging] .es-track{cursor:grabbing}
.es-root[data-disabled]{opacity:.5}
.es-root[data-disabled] .es-track{cursor:default}
.es-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
.es-fill{position:absolute;inset-block:0;inset-inline-start:0;width:0;background:var(--es-gradient);opacity:calc(.3 + .7*var(--es-intensity))}
.es-energy{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none}
.es-root[data-rtl] .es-energy{transform:scaleX(-1)}
.es-root[data-render=webgl] .es-fill,.es-root[data-render=css] .es-energy{display:none}
.es-tick{position:absolute;top:50%;inset-inline-start:calc(var(--es-inset) + (100% - 2*var(--es-inset))*var(--es-at));width:4px;height:4px;margin:-2px;border-radius:50%;background:var(--es-on-track);opacity:.3;transition:opacity .2s ease}
.es-tick.is-passed{opacity:0}

.es-thumb{position:absolute;top:50%;left:0;box-sizing:border-box;width:calc(var(--es-h) - 2px);height:calc(var(--es-h) - 2px);border:.5px solid #00000018;border-radius:calc(var(--es-radius) - 1px);background:linear-gradient(170deg,#fff 0%,#f2f2f4 45%,#dddde2 100%);box-shadow:0 .5px 1px #0000002e,0 2px 6px #00000040,0 5px 12px #0000001f,0 0 calc(var(--es-intensity)*var(--es-ambient)*16px) calc(var(--es-intensity)*var(--es-ambient)*1px) color-mix(in srgb,var(--es-glow) calc(var(--es-intensity)*var(--es-ambient)*65%),transparent),inset 0 .5px #ffffffd9;pointer-events:none;will-change:transform}
.es-root[data-thumb=orb] .es-thumb{border-radius:50%}
.es-root[data-thumb=block] .es-thumb{border-radius:3px}
.es-root[data-thumb=bar] .es-thumb{width:7px;height:calc(var(--es-h) + 8px);border-radius:3.5px}
.es-thumb::after{content:"";position:absolute;inset:-4px;border:1.5px solid var(--es-glow);border-radius:inherit;opacity:0}
.es-root[data-pending] .es-thumb::after{animation:es-pending 1s ease-in-out infinite}
.es-root[data-rejected] .es-track{animation:es-reject .36s ease}
@keyframes es-pending{0%,100%{opacity:0}50%{opacity:.85}}
@keyframes es-reject{0%,100%{translate:0}20%{translate:-5px}45%{translate:4px}70%{translate:-2px}}

@media (prefers-reduced-motion:reduce){
  .es-label.is-arriving{animation:none}
  .es-label,.es-tick{transition:none}
  .es-root[data-pending] .es-thumb::after{animation:none;opacity:.7}
  .es-root[data-rejected] .es-track{animation:none}
}
@media (forced-colors:active){
  .es-track{border:1px solid CanvasText;box-shadow:none}
  .es-energy{display:none!important}
  .es-fill{display:block!important;background:Highlight;opacity:1}
  .es-tick{background:CanvasText}
  .es-thumb{background:ButtonText;border-color:ButtonFace;box-shadow:none}
}
`

const injectedInto = new WeakSet()

/** Add the stylesheet to a document once. Safe to call repeatedly. */
export function injectStyles(target = globalThis.document) {
  if (target === undefined || target === null || injectedInto.has(target)) return
  injectedInto.add(target)
  const style = target.createElement('style')
  style.dataset.effortSlider = ''
  style.textContent = CSS
  ;(target.head ?? target).appendChild(style)
}
