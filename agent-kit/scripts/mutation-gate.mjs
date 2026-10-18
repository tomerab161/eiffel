#!/usr/bin/env node
// Mutation gate (D8, D21, D39): score >= threshold and never below the recorded baseline (ratchet).
// Tool-agnostic: reads the standard mutation-testing-report-schema JSON, which several mutation tools
// emit (others need a small converter). Run your mutation tool first.
// Fails closed: a report older than the HEAD commit, or a committed one, is stale. Zero valid mutants
// (no files, or only compile errors and ignored mutants) fails, unless a human set mutation.allowEmpty.
// Usage: node agent-kit/scripts/mutation-gate.mjs [--update-baseline]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fail, git, headTime, loadConfig, root, table } from './lib.mjs'

const config = loadConfig()
const { reportFile, baselineFile, allowEmpty } = config.mutation
const threshold = config.thresholds.mutationScore
const reportPath = resolve(root, reportFile)

if (!existsSync(reportPath)) fail(`${reportFile} missing. Run your mutation tool first.`)
if (git('ls-files', '--', reportFile)) fail(`${reportFile} is committed. A committed report is never current: remove it from git and generate it in each run.`)
if (statSync(reportPath).mtimeMs < headTime()) fail(`${reportFile} is older than the HEAD commit, so it doesn't judge this code. Re-run your mutation tool.`)

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
let killed = 0
let valid = 0
const survivors = []
for (const [file, data] of Object.entries(report.files ?? {})) {
  for (const m of data.mutants) {
    if (['CompileError', 'RuntimeError', 'Ignored'].includes(m.status)) continue
    valid++
    if (m.status === 'Killed' || m.status === 'Timeout') killed++
    if (m.status === 'Survived' || m.status === 'NoCoverage') {
      survivors.push([relative(root, resolve(root, file)), m.location.start.line, m.mutatorName, m.status, (m.replacement ?? '').slice(0, 40)])
    }
  }
}
if (valid === 0 && allowEmpty !== true) fail(`${reportFile} has 0 valid mutants, so it proves nothing. Check the mutation tool's scope (or a human sets mutation.allowEmpty).`)
const score = valid === 0 ? 100 : (killed / valid) * 100
const baselinePath = resolve(root, baselineFile)
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')).score : 0

if (process.argv.includes('--update-baseline')) {
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, `${JSON.stringify({ score: Number(score.toFixed(2)) }, null, 2)}\n`)
  console.log(`mutation baseline recorded: ${score.toFixed(2)}%`)
}

console.log(`mutation: ${killed}/${valid} killed, score ${score.toFixed(2)}% (threshold ${threshold}%, baseline ${baseline}%)`)
if (survivors.length) console.log(table(survivors, ['file', 'line', 'mutator', 'status', 'replacement']))
if (score < threshold) fail(`mutation score ${score.toFixed(2)}% is below threshold ${threshold}%`)
if (score + 0.01 < baseline) fail(`mutation score ${score.toFixed(2)}% dropped below baseline ${baseline}%`)
console.log('✓ mutation gate')

