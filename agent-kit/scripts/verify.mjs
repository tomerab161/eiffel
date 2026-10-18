#!/usr/bin/env node
// Runs the configured gates in order (D17). The base kit is tech-agnostic (D25): each gate is a shell
// command set in agent-kit.config.json → gates. A fork or project fills them in for its stack.
//
//   node agent-kit/scripts/verify.mjs [fast|quality|security|qa|full]   (default: full, i.e. every CI gate)
//   node agent-kit/scripts/verify.mjs review                            (the review gate only, run by the orchestrator)
//   node agent-kit/scripts/verify.mjs --only <gate>                     (one gate, e.g. the nightly mutation run)
//
// Levels are cumulative: quality = fast + quality gates, security = quality + security gates (D30),
// qa = security + QA gates (D36), full = qa + full gates. Levels follow the pipeline (D47): QA runs before the
// Hardener, so the qa level has no mutation, and full, the Hardener's level, is everything.
// review is a level of its own (D45): the orchestrator runs it after Security and again after the Hardener, and CI never does, because the
// Reviewer's findings live in the run directory. An empty review level fails: it would check nothing.
// A gate set to null is skipped and reported as skipped, unless it is in verify.required (D39), which fails.
// A gate still set to the "TODO" placeholder fails, so an unconfigured kit can never look green.
import { spawnSync } from 'node:child_process'
import { fail, isTodo, loadConfig, requireList, root } from './lib.mjs'

const config = loadConfig()
const levels = ['fast', 'quality', 'security', 'qa', 'full']
const standalone = ['review']
const only = process.argv[2] === '--only' ? process.argv[3] : null
if (process.argv[2] === '--only' && !only) fail('--only needs a gate name')
const level = only ? null : process.argv[2] ?? levels.at(-1)
if (!only && ![...levels, ...standalone].includes(level)) fail(`unknown level "${level}". Use one of: ${[...levels, ...standalone].join(', ')}`)

// Human-owned (agent-kit.config.json is a gate file): gates no project may switch off with null.
const required = config.verify.required
if (!Array.isArray(required)) fail('verify.required is missing from agent-kit.config.json (the gates that may never be null, e.g. ["test", "integrity", "mutation"])')
for (const name of required) {
  if (config.gates[name] === undefined) fail(`gate "${name}" is listed in verify.required but not defined in gates`)
  if (config.gates[name] === null) fail(`gate "${name}" is required (verify.required) and may not be null`)
  // Dropping a required gate from every level would switch it off as surely as null.
  if (![...levels, ...standalone].some((l) => (config.verify[l] ?? []).includes(name))) fail(`gate "${name}" is required (verify.required) but no verify level runs it`)
}

const order = only ? [only] : gatesOf(level)
const started = Date.now()
const skipped = []
for (const name of order) {
  const command = config.gates[name]
  if (command === undefined) fail(`gate "${name}" is ${only ? 'not defined in gates' : 'listed in verify but not defined in gates'}`)
  if (command === null && only) fail(`gate "${name}" is null, so --only has nothing to run`)
  if (command === null) {
    console.log(`⚠ ${name}: skipped, not used in this project (null)`)
    skipped.push(name)
    continue
  }
  if (isTodo(command)) fail(`gate "${name}" is not configured yet: ${command}`)
  console.log(`\n▶ ${name}: ${command}`)
  const result = spawnSync('sh', ['-c', command], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) fail(`gate "${name}" failed`)
  console.log(`✓ ${name}`)
}
const ran = order.length - skipped.length
const skippedNote = skipped.length ? ` (${skipped.join(', ')})` : ''
console.log(`\n✓ verify ${only ? `--only ${only}` : level}: ran ${ran}, skipped ${skipped.length}${skippedNote} in ${Math.round((Date.now() - started) / 1000)}s`)

function gatesOf(name) {
  if (standalone.includes(name)) return requireList(config.verify[name], `verify.${name}`)
  return levels.slice(0, levels.indexOf(name) + 1).flatMap((l) => config.verify[l] ?? [])
}
