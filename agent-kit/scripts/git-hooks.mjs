#!/usr/bin/env node
// Git hooks (D49): what nobody may do with git is refused by git itself, so no agent instruction has to say it.
//   node agent-kit/scripts/git-hooks.mjs install   writes the pre-push and pre-commit hooks (init and every run do this)
//   pre-push    refuses a push to the base branch or a git.protectedBranches branch, a force-push and a branch delete
//   pre-commit  refuses committing a file in integrity.forbiddenFiles (e.g. a real .env), unless it is in
//               integrity.allowedFiles (e.g. .env.example)
// A hook the kit didn't write is kept, with a warning. Hooks can be skipped with --no-verify, which the agent
// adapter denies; server-side branch protection stays the real gate (docs/branch-protection.md).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { git, loadConfig, matchesAny, root } from './lib.mjs'

const MARK = '# agent-kit hook'
const HOOKS = ['pre-push', 'pre-commit']
const [cmd] = process.argv.slice(2)
const commands = { install, 'pre-push': prePush, 'pre-commit': preCommit }
if (!commands[cmd]) refuse(`usage: git-hooks.mjs ${Object.keys(commands).join(' | ')}`)
commands[cmd]()

function install() {
  const dir = resolve(root, git('rev-parse', '--git-path', 'hooks'))
  mkdirSync(dir, { recursive: true })
  for (const name of HOOKS) {
    const file = join(dir, name)
    if (existsSync(file) && !readFileSync(file, 'utf8').includes(MARK)) {
      console.error(`⚠ git hook ${name} exists and wasn't written by agent-kit, so it was kept. Call this from it: node agent-kit/scripts/git-hooks.mjs ${name}`)
      continue
    }
    writeFileSync(file, `#!/bin/sh\n${MARK}: the rules live in agent-kit/scripts/git-hooks.mjs\nexec node "$(git rev-parse --show-toplevel)/agent-kit/scripts/git-hooks.mjs" ${name} "$@"\n`)
    chmodSync(file, 0o755)
  }
}

/** git feeds one line per ref: <local ref> <local sha> <remote ref> <remote sha>. An all-zero sha means none. */
function prePush() {
  const config = loadConfig()
  const protectedBranches = [config.baseBranch, ...(config.git?.protectedBranches ?? [])]
  const none = (sha) => /^0+$/.test(sha)
  const problems = []
  for (const line of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
    const [, local, remoteRef, remote] = line.split(' ')
    const branch = remoteRef.replace(/^refs\/heads\//, '')
    if (protectedBranches.includes(branch)) problems.push(`${branch} is protected: push your own branch and open a draft PR`)
    else if (none(local)) problems.push(`deleting ${remoteRef} is not allowed`)
    else if (!none(remote) && !isAncestor(remote, local)) problems.push(`${remoteRef} would be rewritten (force-push): add commits on top instead`)
  }
  if (problems.length) refuse(`push refused by agent-kit:\n  - ${problems.join('\n  - ')}`)
}

function preCommit() {
  const { integrity } = loadConfig()
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean)
  const forbidden = staged.filter((f) => matchesAny(f, integrity.forbiddenFiles) && !matchesAny(f, integrity.allowedFiles))
  if (forbidden.length) refuse(`commit refused by agent-kit: these files may never be committed (integrity.forbiddenFiles):\n  - ${forbidden.join('\n  - ')}`)
}

function isAncestor(ancestor, sha) {
  try {
    git('merge-base', '--is-ancestor', ancestor, sha)
    return true
  } catch {
    return false
  }
}

function refuse(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}
