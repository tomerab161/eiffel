#!/usr/bin/env node
// Spec gate (D49): the checks on Gherkin that a parser can make, so they are rules of a gate, not of a prompt.
// Every .feature file in the repo, tracked or new:
//   - a Scenario Outline has Examples, and each Examples table has a header row
//   - every <placeholder> in an outline has a column in each of its Examples tables, and every column is used
//     (some Gherkin runners reject an unused column; explanations go in # comments)
//   - each scenario has spec.minSteps to spec.maxSteps steps (Background steps don't count)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fail, git, loadConfig, root } from './lib.mjs'

const config = loadConfig()
const min = config.spec?.minSteps ?? 1
const max = config.spec?.maxSteps ?? Number.POSITIVE_INFINITY
const STEP = /^(Given|When|Then|And|But|\*)\s/
const SCENARIO = /^(Scenario|Example|Scenario Outline|Scenario Template):/
const OUTLINE = /^(Scenario Outline|Scenario Template):/
const BLOCK_END = /^(Scenario|Example|Scenario Outline|Scenario Template|Background|Rule|Feature):/

const files = [...git('ls-files', '--', '*.feature').split('\n'), ...git('ls-files', '--others', '--exclude-standard', '--', '*.feature').split('\n')].filter(Boolean)
const problems = files.flatMap((file) => check(file, readFileSync(resolve(root, file), 'utf8')))
if (problems.length) fail(`spec gate:\n  - ${problems.join('\n  - ')}`)
console.log(`✓ spec gate: ${files.length} feature file(s)`)

function check(file, text) {
  const lines = text.split('\n').map((l) => l.trim())
  const problems = []
  let scenario = null
  const close = () => {
    if (scenario) problems.push(...judge(file, scenario))
    scenario = null
  }
  lines.forEach((line, i) => {
    if (line.startsWith('#') || !line) return
    if (BLOCK_END.test(line)) close()
    if (SCENARIO.test(line)) scenario = { line: i + 1, title: line, outline: OUTLINE.test(line), steps: 0, body: [line], examples: [], table: null }
    else if (!scenario) return
    else if (/^Examples:|^Scenarios:/.test(line)) scenario.table = scenario.examples[scenario.examples.push({ line: i + 1, header: null }) - 1]
    else if (scenario.table && line.startsWith('|') && !scenario.table.header) scenario.table.header = cells(line)
    else if (!scenario.table) {
      if (STEP.test(line)) scenario.steps++
      scenario.body.push(line)
    }
  })
  close()
  return problems
}

function judge(file, s) {
  const at = `${file}:${s.line}`
  const problems = []
  if (s.steps < min || s.steps > max) problems.push(`${at}: ${s.steps} steps, keep each scenario to ${min}–${max} (${s.title})`)
  if (!s.outline) return problems
  if (!s.examples.length) return [...problems, `${at}: Scenario Outline with no Examples`]
  const used = new Set([...s.body.join('\n').matchAll(/<([^<>\n]+)>/g)].map((m) => m[1]))
  for (const table of s.examples) {
    if (!table.header) {
      problems.push(`${file}:${table.line}: Examples with no header row`)
      continue
    }
    for (const column of table.header.filter((c) => !used.has(c))) problems.push(`${file}:${table.line}: Examples column "${column}" is never used in a step. Put explanations in # comments.`)
    for (const name of [...used].filter((u) => !table.header.includes(u))) problems.push(`${file}:${table.line}: <${name}> has no Examples column`)
  }
  return problems
}

function cells(row) {
  return row.split('|').slice(1, -1).map((c) => c.trim())
}
