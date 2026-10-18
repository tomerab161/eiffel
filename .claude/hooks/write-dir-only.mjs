#!/usr/bin/env node
// PreToolUse hook (D45): when the orchestrator sets AGENT_KIT_WRITE_DIR (it does for the Spec-critic and the Reviewer), file writes
// and edits outside that directory are denied. Other roles run without it and are unaffected. Writes through
// Bash aren't seen here: the orchestrator also stops the run if the Reviewer left the repo changed.
// D48: the agent's usage note (AGENT_KIT_USAGE_NOTE, in the run directory) may always be written.
import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const dir = process.env.AGENT_KIT_WRITE_DIR
if (!dir) process.exit(0)
const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
if (!target) process.exit(0)
const note = process.env.AGENT_KIT_USAGE_NOTE
if (note && resolve(input.cwd ?? process.cwd(), target) === resolve(note)) process.exit(0)
const rel = relative(resolve(dir), resolve(input.cwd ?? process.cwd(), target))
if (rel && !rel.startsWith('..') && !isAbsolute(rel)) process.exit(0)
console.error(`Denied: this role may write only inside ${dir} (AGENT_KIT_WRITE_DIR), not ${target}.`)
process.exit(2)
