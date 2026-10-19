#!/usr/bin/env node
// Runs StrykerJS for the mutation gate (D8). Deletes the old report first, so a stale one is never judged.
// When no file matches stryker.config.json → mutate it fails with a clear message. It never writes a fake
// empty report: a gate that judges nothing must not pass. The template skeleton ships real mutants.
// AGENT_KIT_MUTATION_SCOPE=all (the nightly run, D39) mutates the whole codebase: it adds --force, so Stryker
// ignores its incremental cache. Extra args go to Stryker. The report lands in reports/ (git-ignored, never committed).
// Usage: [AGENT_KIT_MUTATION_SCOPE=all] node agent-kit/scripts/mutation-run.mjs && node agent-kit/scripts/mutation-gate.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { globToRegExp, loadConfig, root } from './lib.mjs'

const config = loadConfig()
const report = resolve(root, config.mutation.reportFile)
rmSync(report, { force: true })

const stryker = JSON.parse(readFileSync(resolve(root, 'stryker.config.json'), 'utf8'))
const include = stryker.mutate.filter((g) => !g.startsWith('!')).map(globToRegExp)
const exclude = stryker.mutate.filter((g) => g.startsWith('!')).map((g) => globToRegExp(g.slice(1)))
const targets = walk(root).filter((f) => include.some((re) => re.test(f)) && !exclude.some((re) => re.test(f)))

if (!targets.length) {
  console.error('mutation: FAIL. No file matches stryker.config.json → mutate, so nothing would be judged.')
  console.error('Fix the mutate globs (or add the code they should cover). No empty report is written.')
  process.exit(1)
}
console.log(`mutation: ${targets.length} file(s) to mutate`)
const args = process.argv.slice(2)
if (process.env.AGENT_KIT_MUTATION_SCOPE === 'all' && !args.includes('--force')) args.push('--force')
console.log(`mutation: scope ${args.includes('--force') ? 'all (no incremental cache)' : 'incremental'}`)
const result = spawnSync('pnpm', ['exec', 'stryker', 'run', ...args], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.') || ['dist', 'coverage', 'reports'].includes(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(root, full).split(sep).join('/'))
  }
  return out
}
