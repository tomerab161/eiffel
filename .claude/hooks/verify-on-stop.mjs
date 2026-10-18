#!/usr/bin/env node
// Stop hook (D49): outside the pipeline, Claude can't end its turn with uncommitted changes that fail
// `verify fast`. It is told why once (stop_hook_active stops a loop). Skipped for pipeline roles
// (AGENT_KIT_ROLE: each is judged by its own gate) and while the orchestrator is running (its lock file).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const cwd = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()
if (process.env.AGENT_KIT_ROLE || input.stop_hook_active || orchestratorRunning() || !dirty()) process.exit(0)
const result = spawnSync('node', ['agent-kit/scripts/verify.mjs', 'fast'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (result.status === 0) process.exit(0)
const tail = `${result.stdout}${result.stderr}`.trim().split('\n').slice(-40).join('\n')
console.log(JSON.stringify({ decision: 'block', reason: `\`node agent-kit/scripts/verify.mjs fast\` fails on the uncommitted changes. Fix it before you finish:\n${tail}` }))

function dirty() {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim() !== ''
  } catch {
    return false
  }
}

function orchestratorRunning() {
  try {
    const lock = resolve(cwd, execFileSync('git', ['rev-parse', '--git-path', 'agent-kit-running'], { cwd, encoding: 'utf8' }).trim())
    if (!existsSync(lock)) return false
    process.kill(Number(readFileSync(lock, 'utf8')), 0)
    return true
  } catch {
    return false
  }
}
