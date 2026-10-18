#!/usr/bin/env node
// Dependency scanner for IMAX-kit (D30, D31): runs `pnpm audit --json` over the lockfile and writes the normalized
// findings file that the base deps-gate.mjs judges (`security.deps.findingsFile`).
// Exits non-zero ONLY when the scan cannot run (no network, registry error, unparseable output), so the
// audit gate fails closed. Findings themselves never fail this script: deps-gate.mjs decides.
// Usage: node agent-kit/scripts/deps-scan.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fail, loadConfig, root } from './lib.mjs'

const config = loadConfig()
const out = resolve(root, config.security.deps.findingsFile)
const severity = { info: 'low', low: 'low', moderate: 'medium', medium: 'medium', high: 'high', critical: 'critical' }

const audit = spawnSync('pnpm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  fail(`pnpm audit could not run (exit ${audit.status}):\n${(audit.stderr || audit.stdout).slice(-2000)}`)
}
if (report.error) fail(`pnpm audit could not run: ${report.error.code ?? ''} ${report.error.message ?? JSON.stringify(report.error)}`)
if (!report.advisories) fail(`pnpm audit returned no advisories map:\n${audit.stdout.slice(0, 2000)}`)

const prodPackages = listPackages(['--prod'])
const directs = directDependencies()
const findings = []
for (const adv of Object.values(report.advisories)) {
  for (const finding of adv.findings ?? [{ version: undefined, paths: [] }]) {
    const paths = finding.paths ?? []
    findings.push({
      id: adv.github_advisory_id ?? String(adv.id),
      aliases: [...new Set([String(adv.id), ...(adv.cves ?? [])])],
      kind: /^malicious\b|\bmalware\b/i.test(adv.title ?? '') ? 'malware' : 'vuln',
      package: adv.module_name,
      version: finding.version,
      ecosystem: 'npm',
      severity: severity[adv.severity] ?? 'high',
      fixedIn: fixedIn(adv.patched_versions),
      direct: directs.has(adv.module_name),
      scope: prodPackages.has(`${adv.module_name}@${finding.version}`) ? 'prod' : 'dev',
      path: paths[0] ?? null,
      manifest: 'pnpm-lock.yaml',
      license: null,
    })
  }
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), tool: 'pnpm audit', findings }, null, 2)}\n`)
console.log(`deps-scan: ${findings.length} finding(s) written to ${config.security.deps.findingsFile}`)

/** "<0.0.0" means no fix; ">=1.2.3" → "1.2.3"; anything else is passed through. */
function fixedIn(patched) {
  if (!patched || patched === '<0.0.0') return null
  return patched.match(/^>=\s*([^\s|]+)$/)?.[1] ?? patched
}

/** name@version of every package reachable from production dependencies, across the workspace. */
function listPackages(flags) {
  const res = spawnSync('pnpm', ['list', '-r', '--json', '--depth', 'Infinity', ...flags], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (res.status !== 0) fail(`pnpm list failed: ${res.stderr.slice(-1000)}`)
  const seen = new Set()
  const visit = (deps = {}) => {
    for (const [name, info] of Object.entries(deps)) {
      const key = `${name}@${info.version}`
      if (seen.has(key)) continue
      seen.add(key)
      visit(info.dependencies)
    }
  }
  for (const project of JSON.parse(res.stdout)) visit(project.dependencies)
  return seen
}

function directDependencies() {
  const res = spawnSync('pnpm', ['list', '-r', '--json', '--depth', '0'], { cwd: root, encoding: 'utf8' })
  if (res.status !== 0) fail(`pnpm list failed: ${res.stderr.slice(-1000)}`)
  const names = JSON.parse(res.stdout).flatMap((p) => [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.devDependencies ?? {})])
  return new Set(names)
}
