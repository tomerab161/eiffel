#!/usr/bin/env node
// Integrity gate (D22, D39): a change may not weaken the gates it is judged by.
// Fails if added lines introduce suppressions, skipped/focused tests, if gate-owning files change, or if a file
// in integrity.forbiddenFiles (e.g. a real .env) is added (D49; the pre-commit hook refuses it earlier).
// A human can approve a deliberate change to `gateFiles` by setting AGENT_KIT_GATE_CHANGE_APPROVED=1
// (in CI: only when a maintainer applied the PR label; the CI templates check who did).
// Forbidden patterns always fail: no approval waives them.
// No base branch fails, unless AGENT_KIT_ALLOW_NO_BASE=1 (local use only; CI never sets it).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { baseRef, git, loadConfig, matchesAny, requireList, root } from './lib.mjs'

const config = loadConfig()
const { gateFiles } = config.integrity
const forbiddenPatterns = requireList(config.integrity.forbiddenPatterns, 'integrity.forbiddenPatterns')
const scanGlobs = requireList(config.integrity.scanGlobs, 'integrity.scanGlobs')
const approved = process.env.AGENT_KIT_GATE_CHANGE_APPROVED === '1'
const base = baseRef(config)
if (!base && process.env.AGENT_KIT_ALLOW_NO_BASE === '1') {
  console.log('integrity: no base branch found, skipped (AGENT_KIT_ALLOW_NO_BASE=1)')
  process.exit(0)
}
if (!base) {
  console.error(`✗ integrity gate: no base branch found (${config.baseBranch} or origin/${config.baseBranch}). Fetch it, or set AGENT_KIT_BASE.`)
  console.error('  Locally, with no base on purpose: AGENT_KIT_ALLOW_NO_BASE=1')
  process.exit(1)
}

// Untracked files count as added: stages run this gate before they commit.
const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
const gateChanges = []
// --no-renames: a gate file moved out of gateFiles shows as deleted, not only as its new, unguarded path.
const changed = [...git('diff', '--name-only', '--no-renames', base, '--').split('\n').filter(Boolean), ...untracked]
for (const path of changed) {
  if (matchesAny(path, gateFiles)) gateChanges.push(`${path}: gate configuration changed`)
}

const forbiddenFiles = changed.filter((f) => matchesAny(f, config.integrity.forbiddenFiles) && !matchesAny(f, config.integrity.allowedFiles))

// Gate files are judged by the rule above, so the config that lists the patterns doesn't trip them.
const patterns = forbiddenPatterns.map((p) => ({ label: p, re: new RegExp(p) }))
const hits = []
const scanned = (path) => matchesAny(path, scanGlobs) && !matchesAny(path, gateFiles)
const added = untracked.filter(scanned).flatMap((f) => [`+++ b/${f}`, ...readFileSync(resolve(root, f), 'utf8').split('\n').map((l) => `+${l}`)])
let current = null
for (const line of [...git('diff', '-U0', base, '--').split('\n'), ...added]) {
  if (line.startsWith('+++ ')) {
    current = line.slice(6)
    continue
  }
  if (!line.startsWith('+') || line.startsWith('+++') || !current || !scanned(current)) continue
  for (const { label, re } of patterns) {
    if (re.test(line)) hits.push(`${current}: adds forbidden pattern /${label}/ → ${line.slice(1).trim()}`)
  }
}

hits.push(...forbiddenFiles.filter((f) => existsSync(resolve(root, f))).map((f) => `${f}: this file may never be committed (integrity.forbiddenFiles)`))
if (hits.length) {
  console.error(hits.map((p) => `  - ${p}`).join('\n'))
  console.error('✗ integrity gate: forbidden patterns and files may not be added. No approval waives them: remove them.')
  process.exit(1)
}
if (gateChanges.length && !approved) {
  console.error(gateChanges.map((p) => `  - ${p}`).join('\n'))
  console.error('✗ integrity gate: gates may not be weakened. If this is deliberate, a human approves it (AGENT_KIT_GATE_CHANGE_APPROVED=1).')
  process.exit(1)
}
if (gateChanges.length) console.log(`integrity: ${gateChanges.length} gate change(s) approved by a human`)
console.log('✓ integrity gate')
