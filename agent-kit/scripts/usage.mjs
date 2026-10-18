#!/usr/bin/env node
// Agent usage (D48): what each agent call cost, and what the agent says drove it, so the kit can be tuned run by run.
//
//   node agent-kit/scripts/usage.mjs [<run-id>]   Print one run's report (default: this repo's current run).
//   node agent-kit/scripts/usage.mjs --all        Compare every run in the runs directory, per role.
//
// The orchestrator calls startCall/endCall around every agent process. Per call it keeps, in <run>/usage/:
//   raw/NN-<role>.out   the agent's own output
//   notes/NN-<role>.md  the agent's usage note: what used most of its effort and context, and what would cut it
//   usage.jsonl         one record per call: role, seconds, and whatever usage.read measured
// usage.read is a shell command that gets the raw output file as $AGENT_KIT_AGENT_OUTPUT and prints one JSON
// object (every field optional): { tokens: { input, output, cacheRead, cacheWrite }, cost, turns, model,
// peakContext, contextWindow, tools: { <name>: count }, top: [{ what, tokens }], text, error }. `text` is what goes to
// agents.log instead of the raw output. Without usage.read, a call still records its time and its note.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BAR = 10

/** Reserves the next call number in a run directory and returns its file paths. */
export function startCall(dir, role) {
  const usageDir = join(dir, 'usage')
  for (const sub of ['raw', 'notes']) mkdirSync(join(usageDir, sub), { recursive: true })
  const n = readdirSync(join(usageDir, 'raw')).length + 1
  const name = `${String(n).padStart(2, '0')}-${role}`
  return { dir, role, n, raw: join(usageDir, 'raw', `${name}.out`), note: join(usageDir, 'notes', `${name}.md`), started: Date.now() }
}

/** The instruction appended to every agent prompt when usage.notes is on. */
export function noteTask(file) {
  return [
    '## Usage note (your last step)',
    `Before you finish, write a short note (under 80 words) to ${file}, in three lines:`,
    '- Most usage: what took most of your effort (retries, a long debugging loop, rewrites, waiting on slow commands).',
    '- Most context: what filled your context most (the biggest files you read, long command output, large diffs).',
    '- Improve: one concrete change to the repo, your role file or the kit that would cut it next time.',
    'The note is about your own work in this call. It is not part of the change.',
  ].join('\n')
}

/**
 * Measures a finished call with usage.read, appends its readable text to the agent log, and records it. A reader that
 * fails is recorded as the error, never fails the run: usage is information, not a gate.
 */
export function endCall(call, { config, log, root }) {
  const seconds = (Date.now() - call.started) / 1000
  const read = config.usage?.read
  let measured = {}
  if (read && existsSync(call.raw)) {
    const result = spawnSync('sh', ['-c', read], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, AGENT_KIT_AGENT_OUTPUT: call.raw } })
    try {
      measured = result.status === 0 ? JSON.parse(result.stdout) : { error: `usage.read exited ${result.status}: ${(result.stderr ?? '').trim().slice(0, 200)}` }
    } catch {
      measured = { error: 'usage.read did not print JSON' }
    }
  }
  const { text, ...usage } = measured
  if (log && existsSync(call.raw)) appendFileSync(log, typeof text === 'string' ? `${text}\n` : readFileSync(call.raw))
  const note = existsSync(call.note) ? readFileSync(call.note, 'utf8').trim() : null
  const record = { n: call.n, role: call.role, at: new Date(call.started).toISOString(), seconds, ...usage, note }
  appendFileSync(join(call.dir, 'usage', 'usage.jsonl'), `${JSON.stringify(record)}\n`)
  return record
}

export function readCalls(dir) {
  const file = join(dir, 'usage', 'usage.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

/** Writes <run>/usage/report.md and returns { file, line, table } (line: one line for the terminal; table: for the PR body). */
export function writeReport(dir, id = basename(dir)) {
  const calls = readCalls(dir)
  if (!calls.length) return null
  const roles = byRole(calls)
  const total = sum(calls)
  const basis = shareBasis(calls)
  const top = roles[0]
  const share = (r) => (basis.of(total) ? basis.of(r) / basis.of(total) : 0)
  const table = roleTable(roles, share)
  const items = calls.flatMap((c) => (c.top ?? []).map((t) => ({ role: c.role, n: c.n, ...t }))).sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0)).slice(0, 10)
  const notes = calls.filter((c) => c.note)
  const errors = calls.filter((c) => c.error)
  const report = [
    `# Agent usage · ${id}`,
    `**Total:** ${headline(total, calls.length)}  \n**Top consumer:** ${top.role}, ${pct(share(top))} of ${basis.name}`,
    table,
    items.length ? `## Biggest context items (measured)\n\n| Agent | Call | Item | ~Tokens |\n|---|---|---|---|\n${items.map((t) => `| ${t.role} | ${t.n} | ${cell(t.what)} | ${num(t.tokens)} |`).join('\n')}` : '',
    toolTable(roles),
    `## What each agent says\n\n${notes.length ? notes.map((c) => `**${c.role}** (call ${c.n}${money(c.cost) ? `, ${money(c.cost)}` : ''})\n${c.note.split('\n').map((l) => `> ${l}`).join('\n')}`).join('\n\n') : '_No agent wrote a usage note._'}`,
    errors.length ? `## Not measured\n\n${errors.map((c) => `- call ${c.n} (${c.role}): ${c.error}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  const file = join(dir, 'usage', 'report.md')
  writeFileSync(file, `${report}\n`)
  const line = `📊 usage: ${headline(total, calls.length)} · top: ${top.role} ${pct(share(top))} → ${file}`
  return { file, line, table }
}

/** Every run in the runs directory, per role: how much each role uses on average, so a change to the kit shows up. */
export function compareRuns(runsDir) {
  const runs = existsSync(runsDir) ? readdirSync(runsDir).filter((id) => existsSync(join(runsDir, id, 'usage', 'usage.jsonl'))).sort() : []
  if (!runs.length) return `No measured runs in ${runsDir}.`
  const all = runs.map((id) => ({ id, calls: readCalls(join(runsDir, id)) }))
  const roles = byRole(all.flatMap((r) => r.calls))
  const runsWith = (role) => all.filter((r) => r.calls.some((c) => c.role === role)).length
  return [
    `# Agent usage across ${runs.length} runs`,
    '',
    '| Agent | Runs | Calls | Per run | Peak context (max) | Time per run |',
    '|---|---|---|---|---|---|',
    ...roles.map((r) => {
      const n = runsWith(r.role)
      return `| ${r.role} | ${n} | ${r.calls} | ${money(r.cost / n) || num(r.tokens / n)} | ${num(r.peakContext)} | ${minutes(r.seconds / n)} |`
    }),
    '',
    '## Recent runs',
    '',
    '| Run | Calls | Total | Top consumer |',
    '|---|---|---|---|',
    ...all.slice(-10).map((r) => `| ${r.id} | ${r.calls.length} | ${money(sum(r.calls).cost) || num(sum(r.calls).tokens)} | ${byRole(r.calls)[0].role} |`),
  ].join('\n')
}

// ── helpers ─────────────────────────────────────────────────────────────────

function tokens(c) {
  const t = c.tokens ?? {}
  return (t.input ?? 0) + (t.output ?? 0) + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0)
}

function sum(calls) {
  return {
    cost: calls.reduce((s, c) => s + (c.cost ?? 0), 0),
    tokens: calls.reduce((s, c) => s + tokens(c), 0),
    output: calls.reduce((s, c) => s + (c.tokens?.output ?? 0), 0),
    seconds: calls.reduce((s, c) => s + (c.seconds ?? 0), 0),
    turns: calls.reduce((s, c) => s + (c.turns ?? 0), 0),
    peakContext: Math.max(0, ...calls.map((c) => c.peakContext ?? 0)),
    contextWindow: Math.max(0, ...calls.map((c) => c.contextWindow ?? 0)),
  }
}

/** Roles sorted by what they used: cost when measured, else tokens, else time. */
function byRole(calls) {
  const groups = new Map()
  for (const c of calls) groups.set(c.role, [...(groups.get(c.role) ?? []), c])
  const basis = shareBasis(calls)
  return [...groups].map(([role, list]) => ({ role, calls: list.length, list, ...sum(list) })).sort((a, b) => basis.of(b) - basis.of(a))
}

function shareBasis(calls) {
  if (calls.some((c) => c.cost)) return { name: 'cost', of: (r) => r.cost }
  if (calls.some((c) => tokens(c))) return { name: 'tokens', of: (r) => r.tokens }
  return { name: 'time', of: (r) => r.seconds }
}

function roleTable(roles, share) {
  const rows = roles.map((r) => {
    const s = share(r)
    const filled = Math.round(s * BAR)
    const context = r.peakContext ? `${num(r.peakContext)}${r.contextWindow ? ` (${pct(r.peakContext / r.contextWindow)})` : ''}` : '–'
    return `| ${r.role} | ${r.calls} | ${'█'.repeat(filled)}${'░'.repeat(BAR - filled)} ${pct(s)} | ${money(r.cost) || '–'} | ${num(r.tokens) || '–'} | ${context} | ${minutes(r.seconds)} |`
  })
  return ['| Agent | Calls | Share | Cost | Tokens | Peak context | Time |', '|---|---|---|---|---|---|---|', ...rows].join('\n')
}

function toolTable(roles) {
  const rows = roles.filter((r) => r.list.some((c) => c.tools)).map((r) => {
    const counts = {}
    for (const c of r.list) for (const [name, n] of Object.entries(c.tools ?? {})) counts[name] = (counts[name] ?? 0) + n
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(', ')
    return `| ${r.role} | ${r.turns || '–'} | ${list} |`
  })
  return rows.length ? `## Tool calls\n\n| Agent | Turns | Tools |\n|---|---|---|\n${rows.join('\n')}` : ''
}

function headline(total, calls) {
  return [money(total.cost), total.tokens ? `${num(total.tokens)} tokens` : null, `${calls} agent calls`, minutes(total.seconds)].filter(Boolean).join(' · ')
}

function num(n) {
  if (!n) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(Math.round(n))
}

function money(n) {
  return n ? `$${n.toFixed(2)}` : ''
}

function pct(x) {
  return `${Math.round(x * 100)}%`
}

function minutes(s) {
  if (s >= 60) return `${Math.round(s / 60)}m`
  return s >= 10 ? `${Math.round(s)}s` : `${(s ?? 0).toFixed(1)}s`
}

function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 80)
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runsDir = process.env.AGENT_KIT_RUNS ?? join(homedir(), '.agent-kit', 'runs')
  const arg = process.argv[2]
  if (arg === '--all') console.log(compareRuns(runsDir))
  else {
    const { git } = await import('./lib.mjs')
    const current = resolve(git('rev-parse', '--git-dir'), 'agent-kit-current-run')
    const id = arg ?? (existsSync(current) ? readFileSync(current, 'utf8').trim() : null)
    if (!id) {
      console.error('usage: usage.mjs [<run-id>] | --all  (no run started in this repo yet)')
      process.exit(1)
    }
    const report = writeReport(join(runsDir, id), id)
    console.log(report ? readFileSync(report.file, 'utf8') : `No measured agent calls in run ${id}.`)
  }
}
