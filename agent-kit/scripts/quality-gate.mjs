#!/usr/bin/env node
// Quality gate: cyclomatic complexity, CRAP, function length and file length.
// CRAP(fn) = complexity² × (1 − coverage)³ + complexity, using coverage/coverage-final.json (istanbul format).
// Usage: node agent-kit/scripts/quality-gate.mjs [--no-coverage]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { loadConfig, matchesAny, root, table } from './lib.mjs'

const require = createRequire(resolve(root, 'package.json'))
const ts = require('typescript')
const config = loadConfig()
const t = config.thresholds
const { include, exclude } = config.quality
const useCoverage = !process.argv.includes('--no-coverage')

const coverage = loadCoverage()
const violations = []
const files = walk(root).filter((f) => matchesAny(f, include) && !matchesAny(f, exclude))

for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8')
  const lineCount = text.split('\n').length
  if (lineCount > t.fileLines) violations.push([file, '(file)', 'file lines', lineCount, t.fileLines])

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  visitFunctions(source, (node) => {
    const name = functionName(node)
    const start = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
    const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1
    const complexity = cyclomatic(node)
    const length = end - start + 1
    const label = `${name}:${start}`
    if (complexity > t.complexity) violations.push([file, label, 'complexity', complexity, t.complexity])
    if (length > t.functionLines) violations.push([file, label, 'function lines', length, t.functionLines])
    if (coverage) {
      const cov = functionCoverage(coverage, file, start, end)
      if (cov !== null) {
        const crap = complexity ** 2 * (1 - cov) ** 3 + complexity
        if (crap > t.crap) violations.push([file, label, `CRAP (cov ${Math.round(cov * 100)}%)`, crap.toFixed(1), t.crap])
      }
    }
  })
}

console.log(`quality: ${files.length} files checked${coverage ? ' (with coverage)' : ' (no coverage, CRAP skipped)'}`)
if (violations.length) {
  console.error(table(violations, ['file', 'function', 'metric', 'value', 'limit']))
  console.error(`✗ quality gate: ${violations.length} violation(s)`)
  process.exit(1)
}
console.log('✓ quality gate')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.') || entry === 'dist' || entry === 'coverage' || entry === 'reports') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(root, full))
  }
  return out
}

function visitFunctions(node, cb) {
  if (ts.isFunctionLike(node) && node.body) cb(node)
  ts.forEachChild(node, (child) => visitFunctions(child, cb))
}

function functionName(node) {
  if (node.name) return node.name.getText()
  const parent = node.parent
  if (parent && ts.isVariableDeclaration(parent)) return parent.name.getText()
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText()
  return '<anonymous>'
}

/** McCabe: 1 + decision points, counted inside this function only (nested functions are measured separately). */
function cyclomatic(fn) {
  let count = 1
  const visit = (node) => {
    if (node !== fn && ts.isFunctionLike(node)) return
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.CaseClause:
        count++
        break
      case ts.SyntaxKind.BinaryExpression: {
        const op = node.operatorToken.kind
        if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) count++
        break
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(fn)
  return count
}

function loadCoverage() {
  const file = resolve(root, 'coverage/coverage-final.json')
  if (!useCoverage) return null
  if (!existsSync(file)) {
    console.error('✗ coverage/coverage-final.json missing. Run tests with coverage first, or pass --no-coverage.')
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  return Object.fromEntries(Object.entries(raw).map(([abs, data]) => [relative(root, abs), data]))
}

/** Statement coverage of the statements that fall inside [start, end]. null if the file wasn't instrumented. */
function functionCoverage(cov, file, start, end) {
  const data = cov[file]
  if (!data) return 0 // matched by include but never loaded by any test: uncovered
  let total = 0
  let hit = 0
  for (const [id, loc] of Object.entries(data.statementMap)) {
    if (loc.start.line >= start && loc.end.line <= end) {
      total++
      if (data.s[id] > 0) hit++
    }
  }
  return total === 0 ? null : hit / total
}
