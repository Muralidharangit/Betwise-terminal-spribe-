#!/usr/bin/env node
/**
 * Fail the build if the shop-terminal bundle grows past the kiosk budget.
 * Run after `vite build`. Sizes are uncompressed on disk (what the webview loads).
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), 'dist')
const KB = 1024

const BUDGET = {
  jsTotal: 900 * KB,
  cssTotal: 900 * KB,
  largestJs: 700 * KB,
  largestCss: 650 * KB,
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else acc.push({ path: p, size: st.size, name })
  }
  return acc
}

const files = walk(DIST)
const js = files.filter((f) => f.name.endsWith('.js'))
const css = files.filter((f) => f.name.endsWith('.css'))
const sum = (list) => list.reduce((n, f) => n + f.size, 0)
const max = (list) => list.reduce((m, f) => (f.size > m.size ? f : m), { size: 0, name: '(none)' })

const jsTotal = sum(js)
const cssTotal = sum(css)
const largestJs = max(js)
const largestCss = max(css)

const report = [
  `JS  ${ (jsTotal / KB).toFixed(1) } KB  (budget ${BUDGET.jsTotal / KB} KB)`,
  `CSS ${ (cssTotal / KB).toFixed(1) } KB  (budget ${BUDGET.cssTotal / KB} KB)`,
  `largest JS  ${largestJs.name} ${ (largestJs.size / KB).toFixed(1) } KB`,
  `largest CSS ${largestCss.name} ${ (largestCss.size / KB).toFixed(1) } KB`,
].join('\n')

const failures = []
if (jsTotal > BUDGET.jsTotal) failures.push(`JS total ${jsTotal} > ${BUDGET.jsTotal}`)
if (cssTotal > BUDGET.cssTotal) failures.push(`CSS total ${cssTotal} > ${BUDGET.cssTotal}`)
if (largestJs.size > BUDGET.largestJs) failures.push(`largest JS ${largestJs.size} > ${BUDGET.largestJs}`)
if (largestCss.size > BUDGET.largestCss) failures.push(`largest CSS ${largestCss.size} > ${BUDGET.largestCss}`)

console.log(report)
if (failures.length) {
  console.error('\nBundle budget failed:\n' + failures.join('\n'))
  process.exit(1)
}
console.log('\nBundle budget OK')
