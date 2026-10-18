#!/usr/bin/env node
// Dependency gate (D30, D31). Tool-agnostic: the fork's scanner command writes a normalized findings
// file (schema below), then this script decides pass or fail from thresholds in agent-kit.config.json.
// A scanner that can't run (network down, database fetch failed) must exit non-zero, so the gate fails.
//
//   node agent-kit/scripts/deps-gate.mjs [--all]
//
// Default (PR mode): fail on findings in packages this branch added or changed in a manifest or
// lockfile, plus anything critical. --all (or AGENT_KIT_DEPS_SCOPE=all, used nightly) judges everything.
// Malware always fails, in every mode, and can't be allowlisted.
//
// Findings file: { "generatedAt": ISO date, "findings": [ { id, aliases, kind: vuln|malware|license|policy,
//   package, version, ecosystem, severity: low|medium|high|critical, fixedIn, direct, scope: prod|dev,
//   path, manifest, license } ] }
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { baseRef, fail, git, loadConfig, root, table } from './lib.mjs'

const config = loadConfig()
const deps = config.security?.deps ?? fail('security.deps is missing from agent-kit.config.json')
const all = process.argv.includes('--all') || process.env.AGENT_KIT_DEPS_SCOPE === 'all'
const levels = ['low', 'medium', 'high', 'critical']
const maxAgeMs = 60 * 60 * 1000

const findingsPath = resolve(root, deps.findingsFile)
if (!existsSync(findingsPath)) fail(`${deps.findingsFile} missing. The audit command must write it.`)
const report = JSON.parse(readFileSync(findingsPath, 'utf8'))
if (!(Date.now() - Date.parse(report.generatedAt) < maxAgeMs)) fail(`${deps.findingsFile} is stale or has no generatedAt. Re-run the scanner.`)

const allowed = loadAllowlist()
const changed = all ? null : changedManifestLines()
const blocking = []
for (const f of report.findings ?? []) {
  const reason = blockReason(f)
  if (reason) blocking.push([f.kind, f.package, f.version, f.severity ?? '-', f.scope ?? '-', f.fixedIn ?? 'none', f.id, reason])
}

console.log(`deps: ${report.findings?.length ?? 0} finding(s), ${blocking.length} blocking (${all ? 'all packages' : 'PR mode'})`)
if (blocking.length) {
  console.log(table(blocking, ['kind', 'package', 'version', 'severity', 'scope', 'fixedIn', 'id', 'why']))
  fail('dependency findings over threshold. See the findings file for paths and advisories.')
}
console.log('✓ deps gate')

function blockReason(f) {
  if (f.kind === 'malware') return 'malware always fails'
  if (allowed.has(`${f.id}|${f.package}`)) return null
  if (f.kind === 'license') return (deps.licenses?.deny ?? []).includes(f.license) ? `license ${f.license} denied` : null
  if (f.kind === 'policy') return 'policy'
  const failOn = deps.failOn?.[f.scope ?? 'prod'] ?? 'high'
  // A severity the scanner didn't give, or one not in the list, can't be shown to be under the threshold: it blocks.
  if (levels.includes(f.severity) && levels.indexOf(f.severity) < levels.indexOf(failOn)) return null
  if (f.severity === 'critical') return 'critical'
  if (changed && !changed.some((line) => line.includes(f.package))) return null
  return `${f.severity} ≥ ${failOn} (${f.scope ?? 'prod'})`
}

/** Human-owned. Every entry needs id, package, reason, approvedBy and expires. Expired entries fail. */
function loadAllowlist() {
  const file = resolve(root, deps.allowlistFile)
  if (!existsSync(file)) return new Set()
  const entries = JSON.parse(readFileSync(file, 'utf8')).deps ?? []
  const keys = new Set()
  for (const e of entries) {
    const missing = ['id', 'package', 'reason', 'approvedBy', 'expires'].filter((k) => !e[k])
    if (missing.length) fail(`allowlist entry ${e.id ?? '?'} is missing ${missing.join(', ')}`)
    // Not `<`: an unreadable date is NaN, and NaN < now is false, so the entry would never expire.
    if (!(Date.parse(e.expires) >= Date.now())) fail(`allowlist entry ${e.id} for ${e.package} expired or has an unreadable expiry (${e.expires}). A human renews or removes it.`)
    keys.add(`${e.id}|${e.package}`)
  }
  return keys
}

/** Lines this branch added to manifests and lockfiles. No manifests configured → judge everything (fail closed). */
function changedManifestLines() {
  const base = baseRef(config)
  if (!deps.manifests?.length || !base) return null
  return git('diff', '-U0', base, '--', ...deps.manifests)
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
}
