#!/usr/bin/env node
// Review gate (D45, D39): the Reviewer judged the code exactly as it will ship, and every finding that matters
// was answered. The orchestrator runs it after each review round, with AGENT_KIT_REVIEW_DIR set to the run's
// review directory. It isn't a CI gate: the findings live in the run directory, outside the repo.
// Fails closed when:
//   - review.hunters is not a whole number of at least 1 (a config error), or a hunter's file is missing or stale
//   - findings.json is missing, malformed, older than HEAD, or written for another commit
//   - an important finding is open
//   - a fixed finding names no fixTest that changed on the branch, or a declined one has no reason
//   - a finding that isn't fixed points at a file:line that doesn't exist (a fix may move or remove its line)
// 0 findings passes: "no findings" is a valid result, as long as the file exists and is current.
//
//   AGENT_KIT_REVIEW_DIR=<run>/review node agent-kit/scripts/review-gate.mjs
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { baseRef, fail, git, headTime, loadConfig, readReview, reviewHunters, root } from './lib.mjs'

const SEVERITIES = ['important', 'nit', 'pre-existing']
const STATUSES = ['open', 'fixed', 'declined']

const config = loadConfig()
const hunters = reviewHunters(config)
const dir = process.env.AGENT_KIT_REVIEW_DIR
if (!dir) fail('AGENT_KIT_REVIEW_DIR is not set. The orchestrator runs this gate after the Reviewer, pointing it at the run\'s review directory. It is not a CI gate.')
const head = git('rev-parse', 'HEAD')
const current = (file) => existsSync(file) && statSync(file).mtimeMs >= headTime()

for (let n = 1; n <= hunters; n++) {
  const hunt = join(dir, `hunt-${n}.json`)
  if (!current(hunt) || !readReview(hunt)) fail(`hunt-${n}.json is missing, malformed or older than HEAD. review.hunters is ${hunters}, so ${hunters} hunter(s) must review the final code.`)
}
const file = join(dir, 'findings.json')
if (!existsSync(file)) fail(`${file} is missing. The Reviewer's verify run writes it, even with no findings.`)
if (!current(file)) fail('findings.json is older than the HEAD commit, so the Reviewer didn\'t see the final code. Review again.')
const report = readReview(file)
if (!report) fail('findings.json is malformed: it must be JSON with a "findings" list.')
if (report.head !== head) fail(`findings.json reviewed ${report.head ?? 'no commit'}, not HEAD ${head}. Review again.`)

let changed = null
const problems = []
const ids = new Set()
for (const finding of report.findings) {
  const name = typeof finding.id === 'string' && finding.id ? finding.id : '(no id)'
  if (ids.has(name)) problems.push(`${name}: duplicate id`)
  ids.add(name)
  problems.push(...shape(finding).map((p) => `${name}: ${p}`), ...answered(finding).map((p) => `${name}: ${p}`))
}

const count = (key, value) => report.findings.filter((f) => f[key] === value).length
console.log(`review: ${report.findings.length} finding(s): ${count('severity', 'important')} important, ${count('status', 'fixed')} fixed, ${count('status', 'declined')} declined, ${count('severity', 'pre-existing')} pre-existing`)
if (problems.length) fail(`review findings are not all answered:\n  - ${problems.join('\n  - ')}`)
console.log('✓ review gate')

/** The findings schema (D45): what every finding must carry. */
function shape(f) {
  const problems = []
  if (typeof f.id !== 'string' || !f.id) problems.push('no id')
  if (!SEVERITIES.includes(f.severity)) problems.push(`severity must be one of ${SEVERITIES.join(', ')} (got ${JSON.stringify(f.severity)})`)
  if (!STATUSES.includes(f.status)) problems.push(`status must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(f.status)})`)
  if (!text(f.file) || !Number.isInteger(f.line) || f.line < 1) problems.push('needs a file and a line number')
  if (!text(f.class)) problems.push('no class (the bug class, so every instance gets fixed)')
  if (!text(f.evidence)) problems.push('no evidence')
  return problems
}

/** Every finding that matters got an answer, and the answer holds up. */
function answered(f) {
  if (f.severity === 'important' && f.status === 'open') return [`important finding is open at ${f.file}:${f.line}. The Coder fixes it with a failing test first, or declines it with a reason.`]
  if (f.status === 'declined' && !text(f.reason)) return ['declined with no reason']
  if (f.status === 'fixed' && !changedOnBranch().has(f.fixTest)) return [`fixed, but its fixTest (${f.fixTest ?? 'none'}) is not a test that changed on this branch`]
  if (f.status !== 'fixed' && text(f.file) && !lineExists(f.file, f.line)) return [`points at ${f.file}:${f.line}, which doesn't exist`]
  return []
}

/** Files this branch changed, untracked ones included. No base branch fails: then nothing proves a fix. */
function changedOnBranch() {
  if (changed) return changed
  const base = baseRef(config)
  if (!base) fail(`no base branch found (${config.baseBranch} or origin/${config.baseBranch}), so a fixed finding's test can't be checked. Fetch it, or set AGENT_KIT_BASE.`)
  changed = new Set([...git('diff', '--name-only', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean))
  return changed
}

function lineExists(path, line) {
  const full = resolve(root, path)
  const rel = relative(root, full)
  if (isAbsolute(path) || rel.startsWith('..') || !existsSync(full) || !statSync(full).isFile()) return false
  const lines = readFileSync(full, 'utf8').split('\n')
  return line <= (lines.at(-1) === '' ? lines.length - 1 : lines.length)
}

function text(value) {
  return typeof value === 'string' && value.trim() !== ''
}
