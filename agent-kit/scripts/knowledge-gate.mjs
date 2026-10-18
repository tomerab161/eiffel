#!/usr/bin/env node
// Knowledge gate (D32, D33) for IMAX-kit: checks the Obsidian knowledge base that lives OUTSIDE the repo.
// Run by `orchestrate.mjs knowledge` (not by verify), with AGENT_KIT_KNOWLEDGE_DIR (the vault) and
// AGENT_KIT_KNOWLEDGE_RANGE (`<last>..<head>`, empty on the first run). Plain Node, no dependencies.
//
//   1. links:    every [[wikilink]] (also [[a|alias]], [[a#heading]], ![[embed]]) resolves to a file in the vault.
//   2. coverage: every existing source folder (knowledge.sources: web features, api modules, domain areas,
//                outer shared folders; a folder with only dotfiles or a bare index.ts doesn't count) has an active note whose
//                `source` is that folder. An active note's `source` must exist; a removed one is `status: removed`.
//   3. freshness (only with a range): every note whose `source` has files changed in the range has
//                `synced: <head sha>` in its frontmatter. The Knowledge agent sets it when it updates the note.
//                (Frontmatter, not file mtimes: sync tools rewrite mtimes, a sha is exact and reviewable.)
//   4. reachable: every active note is reachable from Home.md by following links.
// Usage: AGENT_KIT_KNOWLEDGE_DIR=<vault> [AGENT_KIT_KNOWLEDGE_RANGE=a..b] node agent-kit/scripts/knowledge-gate.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fail, git, knowledgeDir, loadConfig, root } from './lib.mjs'

const config = loadConfig()
const kb = knowledgeDir(config) ?? fail('no knowledge base: set AGENT_KIT_KNOWLEDGE_DIR or knowledge.dir')
if (!existsSync(kb.path)) fail(`knowledge base ${kb.path} not found`)
const vault = kb.path
const TYPES = ['feature', 'module', 'domain', 'shared', 'decision']
const SKIP = new Set(['Home', basename(config.knowledge?.conventions ?? '_conventions.md', '.md')])

const files = walk(vault)
const notes = files.filter((f) => f.endsWith('.md')).map(readNote)
const byName = new Map()
for (const f of files) {
  for (const key of [f, f.replace(/\.md$/, ''), basename(f), basename(f).replace(/\.md$/, '')]) {
    if (!byName.has(key)) byName.set(key, f)
  }
}
const problems = []

// 1. links resolve
for (const note of notes) {
  for (const link of note.links) if (link && !byName.has(link)) problems.push(`${note.file}: broken link [[${link}]]`)
}

// 2. coverage
const active = notes.filter((n) => n.meta.status !== 'removed' && !SKIP.has(n.name))
for (const n of notes.filter((n) => !SKIP.has(n.name))) {
  if (!TYPES.includes(n.meta.type)) problems.push(`${n.file}: frontmatter type must be one of ${TYPES.join('|')} (got ${n.meta.type ?? 'nothing'})`)
  if (n.meta.type !== 'decision' && !n.meta.source) problems.push(`${n.file}: frontmatter source is missing`)
}
for (const n of active) {
  if (n.meta.source && !existsSync(resolve(root, n.meta.source))) problems.push(`${n.file}: source ${n.meta.source} no longer exists. Mark the note status: removed`)
}
const covered = new Set(active.map((n) => norm(n.meta.source ?? '')))
const sourceDirs = sourceFolders()
for (const dir of sourceDirs) if (!covered.has(dir)) problems.push(`${dir}: no active note has source: ${dir}`)

// 3. freshness
const range = process.env.AGENT_KIT_KNOWLEDGE_RANGE
if (range) {
  const head = git('rev-parse', range.split('..').pop() || 'HEAD')
  const changed = git('diff', '--name-only', range, '--').split('\n').filter(Boolean)
  for (const n of notes.filter((n) => n.meta.source)) {
    const src = norm(n.meta.source)
    const touched = changed.filter((f) => f === src || f.startsWith(`${src}/`))
    const synced = String(n.meta.synced ?? '')
    if (touched.length && !(synced.length >= 7 && head.startsWith(synced))) {
      problems.push(`${n.file}: ${touched.length} file(s) under ${src} changed in ${range}, but the note's synced is ${synced || 'missing'} (want ${head.slice(0, 12)})`)
    }
  }
  // A source folder deleted in the range needs its note marked removed (covered by check 2) and synced (above).
}

// 4. reachable from Home
const home = notes.find((n) => n.file === 'Home.md')
if (!home) problems.push('Home.md is missing')
else {
  const seen = new Set(['Home.md'])
  const queue = [home]
  while (queue.length) {
    for (const link of queue.shift().links) {
      const target = byName.get(link)
      if (!target || seen.has(target)) continue
      seen.add(target)
      const note = notes.find((n) => n.file === target)
      if (note) queue.push(note)
    }
  }
  for (const n of active) if (!seen.has(n.file)) problems.push(`${n.file}: not reachable from Home.md`)
}

console.log(`knowledge: ${notes.length} note(s), ${sourceDirs.length} source folder(s)${range ? `, range ${range}` : ''} in ${vault}`)
if (problems.length) {
  console.error(problems.map((p) => `  - ${p}`).join('\n'))
  fail(`knowledge gate: ${problems.length} problem(s)`)
}
console.log('✓ knowledge gate')

function readNote(file) {
  const text = readFileSync(join(vault, file), 'utf8')
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  const links = [...prose.matchAll(/!?\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].split('#')[0].trim())
  return { file, name: basename(file, '.md'), meta: fm ? frontmatter(fm[1]) : {}, links }
}

/** Minimal YAML: `key: value`, `key: [a, b]` and `key:` followed by `- item` lines. */
function frontmatter(text) {
  const meta = {}
  let list = null
  for (const line of text.split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/)
    if (item && list) {
      meta[list].push(unquote(item[1]))
      continue
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, value] = kv
    list = value === '' ? key : null
    if (list) meta[key] = []
    else if (value.startsWith('[')) meta[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean)
    else meta[key] = unquote(value)
  }
  return meta
}

function unquote(s) {
  return s.trim().replace(/^["']|["']$/g, '')
}

function norm(p) {
  return p.replace(/^\.\//, '').replace(/\/+$/, '')
}

/** Expands knowledge.sources ("a/*" = each subfolder, {x,y} braces) to folders that hold at least one real file. */
function sourceFolders() {
  const globs = Object.values(config.knowledge?.sources ?? {}).flat().flatMap(braces)
  const dirs = globs.flatMap((g) => (g.endsWith('/*') ? subdirs(g.slice(0, -2)).map((d) => `${g.slice(0, -2)}/${d}`) : [g]))
  return [...new Set(dirs)].filter((d) => existsSync(resolve(root, d)) && walkRepo(resolve(root, d))).sort()
}

function braces(glob) {
  const m = glob.match(/\{([^}]+)\}/)
  return m ? m[1].split(',').flatMap((alt) => braces(glob.replace(m[0], alt))) : [glob]
}

function subdirs(dir) {
  const abs = resolve(root, dir)
  return existsSync(abs) ? readdirSync(abs).filter((d) => statSync(join(abs, d)).isDirectory()) : []
}

/** True when the folder holds real code: a file that isn't a dotfile (.gitkeep) or a bare top-level index.ts placeholder. */
function walkRepo(abs, top = true) {
  return readdirSync(abs).some((e) => {
    if (e.startsWith('.') || (top && /^index\.tsx?$/.test(e))) return false
    return statSync(join(abs, e)).isDirectory() ? walkRepo(join(abs, e), false) : true
  })
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(vault, full))
  }
  return out
}
