#!/usr/bin/env node
// Code scan (D30) for IMAX-kit: ESLint with security rules only (eslint-plugin-security everywhere,
// eslint-plugin-no-unsanitized in apps/web), then secretlint for secrets. Both run over `sast.paths`.
// Findings a human judged safe go in the human-owned allowlist (`sast.allowlistFile`), never in code:
//   eslint:     [{ files: "<glob>", rule: "<rule id>", reason, approvedBy }]  → applied by eslint.security.config.mjs
//   secretlint: [{ files: "<glob>", reason, approvedBy }]                     → written to a temporary ignore file
// Inline disable comments are off (noInlineConfig) and forbidden by the integrity gate.
// Usage: node agent-kit/scripts/sast.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fail, loadConfig, root } from './lib.mjs'

const config = loadConfig()
const { paths, eslintConfig, allowlistFile } = config.sast
const allowlist = existsSync(resolve(root, allowlistFile)) ? JSON.parse(readFileSync(resolve(root, allowlistFile), 'utf8')) : {}
for (const [kind, keys] of [['eslint', ['files', 'rule', 'reason', 'approvedBy']], ['secretlint', ['files', 'reason', 'approvedBy']]]) {
  for (const entry of allowlist[kind] ?? []) {
    const missing = keys.filter((k) => !entry[k])
    if (missing.length) fail(`${allowlistFile}: ${kind} entry ${JSON.stringify(entry)} is missing ${missing.join(', ')}`)
  }
}

const results = []
console.log(`sast: eslint security rules over ${paths.join(', ')}`)
results.push(run('pnpm', ['exec', 'eslint', '--config', eslintConfig, '--max-warnings', '0', '--no-warn-ignored', ...paths]))

const ignoreFile = join(mkdtempSync(join(tmpdir(), 'agent-kit-sast-')), '.secretlintignore')
const ignores = ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', '**/reports/**', ...(allowlist.secretlint ?? []).map((e) => e.files)]
writeFileSync(ignoreFile, `${ignores.join('\n')}\n`)
console.log(`sast: secretlint over ${paths.join(', ')} (${(allowlist.secretlint ?? []).length} allowlisted path(s))`)
results.push(run('pnpm', ['exec', 'secretlint', '--secretlintignore', ignoreFile, ...paths.map((p) => `${p}/**/*`)]))

if (results.some((ok) => !ok)) fail('sast: security findings. Fix the cause; if a finding is wrong, write STUCK.md for a human (allowlist).')
console.log('✓ sast gate')

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }).status === 0
}
