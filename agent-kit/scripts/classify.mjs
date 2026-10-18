#!/usr/bin/env node
// Classifies the current change as small or big (D5, D19).
// Big = more than `classify.bigLines` changed lines (ignoring lockfiles, generated and test files),
//       or any touched file under `classify.protectedPaths`,
//       or (IMAX-kit, D46) a declined Reviewer finding on a protected path, when AGENT_KIT_REVIEW_DIR points at the
//       run's review directory. The orchestrator sets it; CI has no findings, so there it changes nothing.
// CI sets AGENT_KIT_BIG_APPROVED to 0 or 1 (D51): a big change then fails until a maintainer adds the
// big-change-reviewed label, after the human review the mode asks for. Unset (locally), it only reports.
// Usage: [AGENT_KIT_REVIEW_DIR=<run>/review] node agent-kit/scripts/classify.mjs [--json]
import { join } from 'node:path'
import { baseRef, git, loadConfig, matchesAny, readReview, reviewPolicy } from './lib.mjs'

const config = loadConfig()
const { bigLines, protectedPaths, ignore } = config.classify
const base = baseRef(config)
if (!base) {
  // The orchestrator parses --json, so the no-base answer is JSON too.
  if (process.argv.includes('--json')) console.log(JSON.stringify({ size: 'big', lines: 0, protectedHits: [], reasons: ['no base branch found'] }))
  else console.log('classify: no base branch found, treating as big')
  process.exit(0)
}

const numstat = git('diff', '--numstat', '--no-renames', `${base}`, '--')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [added, removed, path] = line.split('\t')
    return { path, lines: (Number(added) || 0) + (Number(removed) || 0) }
  })

const counted = numstat.filter((f) => !matchesAny(f.path, ignore))
const lines = counted.reduce((sum, f) => sum + f.lines, 0)
const protectedHits = numstat.filter((f) => matchesAny(f.path, protectedPaths)).map((f) => f.path)

const declinedHits = declinedOnProtected()

const reasons = []
if (lines > bigLines) reasons.push(`${lines} changed lines > ${bigLines}`)
if (protectedHits.length) reasons.push(`touches protected paths: ${protectedHits.join(', ')}`)
if (declinedHits.length) reasons.push(`declined review findings on protected paths: ${declinedHits.join(', ')}`)
const size = reasons.length ? 'big' : 'small'

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ size, lines, protectedHits, declinedHits, reasons }))
} else {
  console.log(`classify: ${size.toUpperCase()} (${lines} counted lines)`)
  for (const r of reasons) console.log(`  - ${r}`)
  console.log(`  → human review (${config.review.mode}): ${reviewPolicy(config, size).summary}`)
  if (size === 'big' && process.env.AGENT_KIT_BIG_APPROVED === '0') {
    console.error('✗ big change: after that review, a maintainer adds the big-change-reviewed label')
    process.exitCode = 1
  }
}

/** D46: a declined finding is a human's call the gates can't prove, so on a protected path it needs a human reader. */
function declinedOnProtected() {
  const dir = process.env.AGENT_KIT_REVIEW_DIR
  if (!dir) return []
  const findings = readReview(join(dir, 'findings.json'))?.findings ?? []
  return findings
    .filter((f) => f.status === 'declined' && matchesAny(String(f.file ?? '').replace(/^\.\//, ''), protectedPaths))
    .map((f) => `${f.file}:${f.line}`)
}
