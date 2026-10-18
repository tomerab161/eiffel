#!/usr/bin/env node
// QA coverage gate (D36). Every QA procedure the Specifier wrote has an executable script, and they stay aligned.
// A script names the procedure it automates with a marker line, e.g.  // qa-procedure: qa/booking/book-a-slot.md
// The scripts themselves run in the `e2e` gate, which the fork configures (through the UI only).
// Zero procedures fails (D39). A project without a UI sets gates.qa to null, which verify reports as skipped.
//
//   node agent-kit/scripts/qa-gate.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { baseRef, fail, git, loadConfig, matchesAny, requireList, root } from './lib.mjs'

const config = loadConfig()
const qa = config.qa ?? {}
const noUi = 'A project without a UI sets gates.qa to null instead.'
requireList(qa.procedures, 'qa.procedures')
requireList(qa.scripts, 'qa.scripts')
const marker = qa.marker ?? 'qa-procedure:'
const files = [...new Set([...git('ls-files').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')])].filter(Boolean)
const procedures = files.filter((f) => matchesAny(f, qa.procedures))
const scripts = files.filter((f) => matchesAny(f, qa.scripts))
if (!procedures.length) fail(`no QA procedures match qa.procedures (${qa.procedures.join(', ')}), so there is nothing to prove. ${noUi}`)

const covers = new Map() // procedure → scripts that name it
const problems = []
for (const script of scripts) {
  for (const line of readFileSync(resolve(root, script), 'utf8').split('\n')) {
    const at = line.indexOf(marker)
    if (at < 0) continue
    const target = line.slice(at + marker.length).trim()
    if (!procedures.includes(target)) problems.push(`${script} names ${target}, which is not a QA procedure`)
    covers.set(target, [...(covers.get(target) ?? []), script])
  }
}
for (const p of procedures) if (!covers.has(p)) problems.push(`${p} has no QA script (add "${marker} ${p}" to the script that runs it)`)

const base = baseRef(config)
if (base) {
  const changed = new Set(git('diff', '--name-only', base).split('\n').concat(git('ls-files', '--others', '--exclude-standard').split('\n')))
  for (const p of procedures.filter((f) => changed.has(f))) {
    if (!(covers.get(p) ?? []).some((s) => changed.has(s))) problems.push(`${p} changed but none of its scripts did`)
  }
}

console.log(`qa: ${procedures.length} procedure(s), ${scripts.length} script(s)`)
if (problems.length) fail(`QA scripts are missing or out of date:\n  - ${problems.join('\n  - ')}`)
console.log('✓ qa gate')
