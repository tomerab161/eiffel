#!/usr/bin/env node
// Scope gate (D49): a pipeline role changes only what its job allows. The orchestrator runs it after the role and
// before its gate, against the commit the stage started from, so the role's own commits count too.
//   node agent-kit/scripts/scope-gate.mjs <role> <from-commit>
// scope.roles.<role>, all optional (a role with no entry has no limits):
//   only            every changed file matches one of these globs (e.g. the Specifier writes only the spec)
//   frozen          no changed file matches one of these globs (e.g. the approved .feature files)
//   keepAssertions  no assertion line (scope.assertionPattern) in a test file (scope.testFiles) is removed or
//                   changed. Moving one is fine: the same line added anywhere counts as kept.
// In a list, "@procedures" stands for qa.procedures and "@dependencies" for scope.dependencyFiles.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fail, git, loadConfig, matchesAny, requireList, root } from './lib.mjs'

const config = loadConfig()
const [role, from] = process.argv.slice(2)
if (!role || !from) fail('usage: scope-gate.mjs <role> <from-commit>')
const rules = config.scope?.roles?.[role]
if (!rules) {
  console.log(`scope: no limits for ${role}`)
  process.exit(0)
}

const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
const changed = [...git('diff', '--name-only', '--no-renames', from, '--').split('\n').filter(Boolean), ...untracked]
const problems = []
if (rules.only) {
  const only = expand(rules.only, `scope.roles.${role}.only`)
  for (const f of changed.filter((f) => !matchesAny(f, only))) problems.push(`${f}: ${role} may change only ${only.join(', ')}`)
}
if (rules.frozen) {
  const frozen = expand(rules.frozen, `scope.roles.${role}.frozen`)
  for (const f of changed.filter((f) => matchesAny(f, frozen))) problems.push(`${f}: frozen for ${role}${hint(f)}`)
}
if (rules.keepAssertions) problems.push(...lostAssertions())

if (problems.length) {
  console.error(problems.map((p) => `  - ${p}`).join('\n'))
  fail(`scope gate: ${role} changed what its job doesn't allow. Undo those changes. If the job can't be done without them, write STUCK.md for a human.`)
}
console.log(`✓ scope gate (${role}): ${changed.length} file(s) changed, all in scope`)

/** Assertion lines removed or rewritten since `from`. A line added back anywhere, e.g. in a moved test, is kept. */
function lostAssertions() {
  const tests = requireList(config.scope.testFiles, 'scope.testFiles')
  const pattern = config.scope.assertionPattern
  if (typeof pattern !== 'string' || !pattern || /^TODO\b/.test(pattern)) fail('scope.assertionPattern is not configured: a regex for a line that holds an assertion')
  const re = new RegExp(pattern)
  const removed = []
  const added = new Set(untracked.flatMap((f) => readFileSync(resolve(root, f), 'utf8').split('\n')).map((l) => l.trim()))
  let file = null
  for (const line of git('diff', '-U0', '--no-renames', from, '--').split('\n')) {
    if (line.startsWith('--- ')) file = line.slice(6)
    else if (line.startsWith('+++ ')) continue
    else if (line.startsWith('+')) added.add(line.slice(1).trim())
    else if (line.startsWith('-') && file && matchesAny(file, tests) && re.test(line)) removed.push({ file, text: line.slice(1).trim() })
  }
  return removed.filter((r) => !added.has(r.text)).map((r) => `${r.file}: assertion removed or changed → ${r.text}`)
}

function expand(globs, key) {
  return requireList(globs, key).flatMap((g) => {
    if (g === '@procedures') return config.qa?.procedures ?? []
    if (g === '@dependencies') return requireList(config.scope.dependencyFiles, 'scope.dependencyFiles')
    return [g]
  })
}

function hint(file) {
  if (matchesAny(file, config.scope.dependencyFiles ?? [])) return '. Only the Security role moves dependency versions, and a human adds dependencies.'
  if (file.endsWith('.feature') || matchesAny(file, config.qa?.procedures ?? [])) return '. The approved spec changes only through a human.'
  return ''
}
