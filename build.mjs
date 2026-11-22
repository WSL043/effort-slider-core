/**
 * Builds two things:
 *
 *   demo.html   one self-contained page (demo, component, CSS inlined). It
 *               opens from disk with no server, so it is committed.
 *   dist/       the library as a single ESM file and a single classic script
 *               (global `EffortSlider`), for use without a bundler.
 *
 *   npm install
 *   npm run build
 */
import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const BUNDLE = 'demo/.bundle.js'
const shared = { bundle: true, minify: true, target: 'es2022', logLevel: 'warning' }

await build({ ...shared, entryPoints: ['demo/main.js'], format: 'iife', outfile: BUNDLE })

const css = await readFile('demo/demo.css', 'utf8')
// A literal </script> inside the bundle would end the inline block early.
const js = (await readFile(BUNDLE, 'utf8')).replaceAll('</script', '<\\/script')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Interactive demo of effort-slider-core: a reasoning-effort slider with a WebGL renderer and presets drawn from natural phenomena">
<title>Effort Slider Core</title>
<link rel="icon" href="data:,">
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`
await writeFile('demo.html', html)
await rm(BUNDLE, { force: true })

await mkdir('dist', { recursive: true })
await build({ ...shared, entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/effort-slider.js' })
await build({ ...shared, entryPoints: ['src/index.js'], format: 'iife', globalName: 'EffortSlider', outfile: 'dist/effort-slider.global.js' })

const size = async file => `${Math.round((await readFile(file)).length / 1024)} kB`
console.log(`demo.html ${Math.round(html.length / 1024)} kB · dist/effort-slider.js ${await size('dist/effort-slider.js')}`)
