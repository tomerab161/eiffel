#!/usr/bin/env node
// Claude Code adapter, usage.read (D48): reads one agent call's output (`claude -p --output-format stream-json
// --verbose`) and prints the kit's usage record. Totals come from the final result event. Peak context is the largest
// prompt any single model request carried. The biggest tool results are what filled the context.
//   node .claude/usage.mjs <output file>    (the orchestrator passes $AGENT_KIT_AGENT_OUTPUT)
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

const TOP = 5
const CHARS_PER_TOKEN = 4
const file = process.argv[2] ?? process.env.AGENT_KIT_AGENT_OUTPUT
const events = readFileSync(file, 'utf8').split('\n').flatMap((line) => {
  try {
    return line.startsWith('{') ? [JSON.parse(line)] : []
  } catch {
    return []
  }
})
const result = events.findLast((e) => e.type === 'result')
const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
const cwd = init?.cwd ?? process.cwd()

// One model request can stream as several assistant events with the same message id and usage: count it once.
const requests = new Map()
const uses = new Map()
for (const e of events.filter((ev) => ev.type === 'assistant')) {
  const message = e.message ?? {}
  if (message.usage) requests.set(message.id ?? requests.size, message.usage)
  for (const block of message.content ?? []) if (block.type === 'tool_use') uses.set(block.id, block)
}
const prompt = (u) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
const peakContext = Math.max(0, ...[...requests.values()].map(prompt))

const tools = {}
for (const use of uses.values()) tools[use.name] = (tools[use.name] ?? 0) + 1

const results = events.filter((e) => e.type === 'user').flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []).filter((b) => b.type === 'tool_result'))
const top = results
  .map((r) => ({ what: describe(uses.get(r.tool_use_id)), tokens: Math.round(size(r.content) / CHARS_PER_TOKEN) }))
  .sort((a, b) => b.tokens - a.tokens)
  .slice(0, TOP)

const usage = result?.usage ?? {}
const models = Object.entries(result?.modelUsage ?? {})
const record = {
  tokens: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0 },
  cost: result?.total_cost_usd ?? 0,
  turns: result?.num_turns ?? 0,
  model: models.map(([name]) => name).join(', ') || init?.model,
  peakContext,
  contextWindow: Math.max(0, ...models.map(([, m]) => m.contextWindow ?? 0)) || undefined,
  tools,
  top,
  text: typeof result?.result === 'string' ? result.result : events.filter((e) => e.type === 'assistant').flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text)).join('\n'),
  ...(result ? {} : { error: 'no result event: the agent was stopped or timed out, so totals are missing' }),
  ...(result?.is_error ? { error: `the agent ended with an error (${result.subtype})` } : {}),
}
console.log(JSON.stringify(record))

function size(content) {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) return content.reduce((n, c) => n + (c.text?.length ?? JSON.stringify(c).length), 0)
  return JSON.stringify(content ?? '').length
}

function describe(use) {
  if (!use) return 'tool result'
  const input = use.input ?? {}
  const path = input.file_path ?? input.notebook_path
  if (path) return `${use.name} ${relative(cwd, path) || path}`
  if (input.command) return `${use.name} ${String(input.command).slice(0, 60)}`
  if (input.pattern) return `${use.name} ${String(input.pattern).slice(0, 60)}`
  return use.name
}
