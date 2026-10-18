// Shared helpers for agent-kit gate scripts. Node >= 22, no dependencies beyond the project's own.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'

export const root = process.cwd()

export function loadConfig() {
  const file = resolve(root, 'agent-kit.config.json')
  if (!existsSync(file)) fail(`agent-kit.config.json not found in ${root}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Base ref for diff-based gates: CI env first, then origin/main, then main. */
export function baseRef(config) {
  const fromEnv = process.env.AGENT_KIT_BASE ?? process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA ?? process.env.GITHUB_BASE_REF
  const candidates = [fromEnv && (fromEnv.match(/^[0-9a-f]{40}$/) ? fromEnv : `origin/${fromEnv}`), `origin/${config.baseBranch}`, config.baseBranch]
  for (const ref of candidates.filter(Boolean)) {
    try {
      return git('merge-base', 'HEAD', ref)
    } catch {}
  }
  return null
}

/** Minimal glob → RegExp: supports **, *, ? and {a,b}. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      re += `(?:${glob.slice(i + 1, end).split(',').map(escape).join('|')})`
      i = end
    } else re += escape(c)
  }
  return new RegExp(`^${re}$`)
}
const escape = (s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path))

/** A value still set to the "TODO" placeholder: a string, or a list with a TODO entry. Unconfigured never passes. */
export const isTodo = (value) => (Array.isArray(value) ? value.some(isTodo) : typeof value === 'string' && /^TODO\b/.test(value))

/** A list a gate needs to judge anything: missing, empty or TODO fails, so the gate can't pass by checking nothing. */
export function requireList(value, key) {
  if (!Array.isArray(value) || !value.length) fail(`${key} is empty in agent-kit.config.json. An empty list would check nothing, so it fails.`)
  if (isTodo(value)) fail(`${key} is not configured yet: ${value.find(isTodo)}`)
  return value
}

/** Commit time of HEAD in ms, to reject reports written before the code they judge. */
export const headTime = () => Number(git('log', '-1', '--format=%ct', 'HEAD')) * 1000

export function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

export function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ')
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n')
}

/**
 * Review policy (D26). `review.mode` in agent-kit.config.json:
 *   strict: humans review Gherkin and architecture-facing changes only
 *   full:   humans read every change, guided by a reading guide
 */
export function reviewPolicy(config, size) {
  const mode = config.review?.mode
  if (mode === 'full') {
    return {
      readingGuide: true,
      architectureNote: false,
      explainBack: size === 'big',
      summary: size === 'big' ? 'read all code with the reading guide, then write the explain-back.' : 'read all code with the reading guide.',
    }
  }
  if (mode === 'strict') {
    return {
      readingGuide: false,
      architectureNote: size === 'big',
      explainBack: false,
      // IMAX-kit (D46): of the Review findings, humans read the declined and pre-existing ones, nothing else.
      summary: size === 'big'
        ? 'review the architecture note, the protected-path diff and the declined and pre-existing Review findings only. Code is proven by the gates.'
        : 'only the declined and pre-existing Review findings, if any. Otherwise merges on green gates.',
    }
  }
  fail(`review.mode must be "strict" or "full" in agent-kit.config.json (got ${JSON.stringify(mode)})`)
}

/**
 * Where the knowledge base lives (D32, D33): outside the repo, on each person's machine. AGENT_KIT_KNOWLEDGE_DIR
 * wins over knowledge.dir, so each person can keep it wherever they like.
 */
export function knowledgeDir(config) {
  const dir = process.env.AGENT_KIT_KNOWLEDGE_DIR ?? config.knowledge?.dir
  if (!dir) return null
  const path = resolve(root, dir.replace(/^~(?=$|\/)/, homedir()))
  const rel = relative(root, path)
  return { path, external: rel.startsWith('..') || isAbsolute(rel) }
}

/** review.hunters (D45): how many fresh Reviewers hunt each round. Fewer than 1 would review nothing: a config error. */
export function reviewHunters(config) {
  const hunters = config.review?.hunters
  if (!Number.isInteger(hunters) || hunters < 1) fail(`review.hunters must be a whole number of at least 1 in agent-kit.config.json (got ${JSON.stringify(hunters)}). 0 hunters would review nothing.`)
  return hunters
}

/** A Reviewer file (D45): `{ head?, findings: [...] }`, or null when it is missing or malformed. */
export function readReview(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data?.findings) ? data : null
  } catch {
    return null
  }
}
