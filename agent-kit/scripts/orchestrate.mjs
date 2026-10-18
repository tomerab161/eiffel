#!/usr/bin/env node
// Pipeline orchestrator (D3, D7, D22). Agent-agnostic: each role runs as a fresh process
// built from agent-kit.config.json → agent.command (the Claude Code adapter fills this in).
//
//   feature "<request>"   Specifier writes Gherkin, the Spec-critic checks it (D47), the Specifier fixes the gaps once,
//                         then the run pauses for human review.
//   feature <work-item id> The same as feature --issue <id> when tracker.read is set (42, #42, PROJ-123).
//   feature --issue <id>  The same, with a work item from the tracker as the request (tracker.read). The PR body
//                         then carries tracker.closeLine, which links the change to that work item.
//   answer [<run-id>] "<answers>"  Answer the Specifier's open questions and let it try again.
//   approve [<run-id>]    Coder → Architect → Security → Reviewer → QA → Hardener → re-review, each with a
//                         retry budget and a gate (D47: bugs are found before mutation tests pin them). The Reviewer (D45)
//                         hands its open findings back to the Coder, round by round. The re-review reads only what QA
//                         and the Hardener changed, and is skipped when that is only tests.
//                         On a stuck run, approve does what resume does. At the end it opens the draft PR (pr.open).
//   resume [<run-id>]     Continue a stuck run from the stage that got stuck, after a human fixed the cause.
//   fix "<request>"       Small path: Coder, judged by the full verify, then the Reviewer (review.onFix). Also takes --issue <id>.
//   knowledge             After merging: update the knowledge base with everything merged since its last update.
//                         A local notes folder (knowledge.dir, Knowledge agent), or a work-item tracker (knowledge.sync).
//   status [<run-id>]     Show where a run stands.
//
// The run id is optional: without one, a command acts on this repo's current run (the last one started here).
// Agent output goes to <run>/agents.log, so the terminal (or the chat that started the run) only gets one line
// per stage. AGENT_KIT_VERBOSE=1 streams it to the terminal instead.
//
// Usage (D48): every agent call is measured (usage.read) and writes a note on what drove its usage. When a command
// ends, <run>/usage/report.md is rewritten for the whole run and one line points at it. See usage.mjs.
// Scope (D49): every stage is also judged by the scope gate (what its role may change, scope.roles) and told its gate
// in the prompt. Agents run with AGENT_KIT_ROLE set, and a lock file in the git dir marks a running orchestrator.
//
// Isolation: the request and task list live in a run directory OUTSIDE the repo
// ($AGENT_KIT_RUNS or ~/.agent-kit/runs/<id>). Only the Specifier is given access to it. The Reviewer sees the
// request in its prompt, and reads and writes only <run>/review/, so it never sees the other agents' notes.
import { spawnSync } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { baseRef, fail, git, isTodo, knowledgeDir, loadConfig, matchesAny, readReview, reviewHunters, reviewPolicy, root } from './lib.mjs'
import { endCall, noteTask, startCall, writeReport } from './usage.mjs'

const config = loadConfig()
/** A request that is only a work-item id (`42`, `#42`, `PROJ-123`) reads that work item from the tracker. */
/** Longest PR title before it is cut at a word boundary. */
const PR_TITLE_MAX = 72
const WORK_ITEM_ID = /^#?(\d+|[A-Z][A-Z0-9]*-\d+)$/
const runsDir = process.env.AGENT_KIT_RUNS ?? join(homedir(), '.agent-kit', 'runs')
let agentLog = null
let agentCalls = 0
/** The run the last save() wrote, so an agent that fails to run can mark it stuck. */
let activeRun = null
const [cmd, arg] = process.argv.slice(2)
const commands = { feature, answer, approve, resume, fix, status, knowledge }
if (!commands[cmd]) fail('usage: orchestrate.mjs feature "<request>" | feature --issue <id> | answer [<run-id>] "<answers>" | approve [<run-id>] | resume [<run-id>] | fix "<request>" | status [<run-id>] | knowledge')
process.on('exit', reportUsage)
const otherRunning = liveLock()
holdLock()
commands[cmd](arg, process.argv[4])

function feature(request, id) {
  if (request === '--issue') return specify(createRun('feature', readWorkItem(id), id))
  if (WORK_ITEM_ID.test(request ?? '') && config.tracker?.read) return feature('--issue', request.replace(/^#/, ''))
  if (WORK_ITEM_ID.test(request ?? '')) fail(`"${request}" looks like a ticket id, but tracker.read is not set. Set it (init --tracker), or paste the ticket text instead.`)
  if (!request) fail('feature needs a request (text, or @path/to/file.md)')
  specify(createRun('feature', request))
}

/** Reads a work item from the tracker (tracker.read, `{id}` filled in) as the request. Prints JSON with title and body. */
function readWorkItem(id) {
  const read = config.tracker?.read
  if (!read) fail('--issue needs tracker.read in agent-kit.config.json: a command that prints the work item as JSON {title, body}')
  if (!/^[\w-]+$/.test(id ?? '')) fail('--issue needs a work-item id (letters, digits, - or _)')
  const result = spawnSync('sh', ['-c', read.replaceAll('{id}', id)], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) fail(`could not read work item ${id}: ${(result.stderr ?? '').trim()}`)
  const item = JSON.parse(result.stdout)
  return `${item.title}\n\n${item.body ?? ''}`.trim()
}

function answer(id, answers) {
  if (answers === undefined && id !== undefined && !isRun(id)) return answer(undefined, id)
  const run = loadRun(id)
  if (!answers) fail('answer needs the answers (text, or @path/to/file.md)')
  useRunBranch(run)
  const text = answers.startsWith('@') ? readFileSync(resolve(root, answers.slice(1)), 'utf8') : answers
  run.request = `${run.request}\n\n## Answers to the Specifier's questions\n\n${text}`
  writeFileSync(join(run.dir, 'request.md'), `${run.request}\n`)
  specify(run)
}

function specify(run) {
  const prompt = [
    rolePrompt('specifier'),
    `Run id: ${run.id}`,
    `Private run directory (write tasks.md here, nowhere else): ${run.dir}`,
    `Request:\n\n${run.request}`,
  ].join('\n\n')
  const specOk = writeSpec(run, prompt)
  const features = changedFeatures()
  const critique = features.length && config.review.specCritic !== false ? critiqueSpec(run, features) : null
  const revisedOk = critique?.gaps ? writeSpec(run, [prompt, reviseTask(critique.text)].join('\n\n')) : specOk
  const revised = critique?.gaps ? changedFeatures() : features
  if (!revised.length) {
    save(run, { stage: 'specify', state: 'questions' })
    console.log(`\n⏸  The Specifier has questions: ${join(run.dir, 'tasks.md')}`)
    console.log(`   Answer them with: node agent-kit/scripts/orchestrate.mjs answer "<answers>"`)
    process.exitCode = 3
    return
  }
  commit(run, `spec: ${run.slug}`)
  if (!revisedOk) console.error(`\n⚠ The spec still fails its gate (\`${specGate()}\`). Fix the .feature files before approve: approve checks it again.`)
  const procedures = changedProcedures()
  save(run, { stage: 'review', state: 'waiting', features: revised, procedures })
  console.log(`\n⏸  Human review needed (the key checkpoint). Read:\n${[...revised, ...procedures].map((f) => `   - ${f}`).join('\n')}`)
  console.log(`   Task list: ${join(run.dir, 'tasks.md')}`)
  if (critique) console.log(`   Spec-critic: ${critique.file}${critique.gaps ? ' (the Specifier has answered its gaps once)' : ' (no gaps)'}`)
  else if (config.review.specCritic !== false) console.log('   ⚠ The Spec-critic wrote no verdict. Read the spec with extra care.')
  console.log(`   Edit the .feature files if needed, then: node agent-kit/scripts/orchestrate.mjs approve (it commits your edits)`)
}

/**
 * Spec-critic (D47). A fresh agent checks the Gherkin and QA procedures against the request before a human reads
 * them: missing cases, vague steps, rules with no scenario. It writes only <run>/spec-critic/critique.md, whose first
 * line is `Verdict: ok` or `Verdict: gaps`. Null when it wrote no verdict.
 */
function critiqueSpec(run, features) {
  const dir = join(run.dir, 'spec-critic')
  const file = join(dir, 'critique.md')
  mkdirSync(dir, { recursive: true })
  rmSync(file, { force: true })
  const prompt = [
    rolePrompt('spec-critic'),
    `Run id: ${run.id}`,
    `Request:\n\n${run.request}`,
    `The Specifier's .feature files:\n${features.map((f) => `- ${f}`).join('\n')}`,
    `QA procedures of this run:\n${changedProcedures().map((f) => `- ${f}`).join('\n') || '- (none changed)'}`,
    `Output file: ${file}`,
  ].join('\n\n')
  const tree = () => git('rev-parse', 'HEAD') + git('status', '--porcelain', '--untracked-files=all') + git('diff')
  const before = tree()
  agent('spec-critic', prompt, [dir], { AGENT_KIT_WRITE_DIR: dir })
  if (tree() !== before) fail(`the Spec-critic changed files in the repo. It may write only to ${dir}. Revert them, then: node agent-kit/scripts/orchestrate.mjs answer "<answers>"`)
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const verdict = text.match(/^Verdict: (ok|gaps)\s*$/m)?.[1]
  return verdict ? { file, text, gaps: verdict === 'gaps' } : null
}

function reviseTask(critique) {
  return [
    'The Spec-critic checked your spec and found gaps:',
    critique,
    'Fix each real gap in the .feature files and QA procedures. If a point is not a gap, say why under "Critique answers" in tasks.md. If a gap needs the requester\'s answer, add it to the questions in tasks.md and leave the scenario out.',
  ].join('\n\n')
}

function approve(id) {
  const run = loadRun(id)
  if (interrupted(run)) return resume(run.id)
  if (run.state === 'stuck') return resume(run.id)
  if (run.stage === 'done') return openPr(run)
  if (run.stage !== 'review') fail(`run ${run.id} is at stage "${run.stage}", not waiting for review`)
  useRunBranch(run)
  const spec = runGate(run.specFrom ? `${scopeCheck('specifier', run.specFrom)} && ${specGate()}` : specGate())
  if (!spec.ok) fail('the spec fails its gate (above). Fix the .feature files and QA procedures, then approve again.')
  commit(run, `spec: review edits (${run.slug})`)
  const features = changedFeatures()
  writeFileSync(join(run.dir, 'features.txt'), `${features.join('\n')}\n`)
  save(run, { stage: 'code', state: 'running', features })

  runStages(run, 'coder')
}

function resume(id) {
  const run = loadRun(id)
  if (interrupted(run)) {
    console.log(`… run ${run.id} was interrupted at ${run.stage} (timeout, Ctrl-C or a closed shell). Continuing from there.`)
    save(run, { state: 'stuck' })
  }
  if (run.state !== 'stuck') fail(`run ${run.id} is ${run.state}, not stuck`)
  useRunBranch(run)
  if (existsSync(resolve(root, 'STUCK.md'))) fail('STUCK.md is still at the repo root. Fix the cause, delete it, then resume.')
  // A human's fix is committed first, so the next stage's scope gate judges only what that stage changes.
  commit(run, `human fix after stuck ${run.stage} (${run.slug})`)
  if (run.kind === 'fix') return fixStages(run, run.stage)
  run.features = changedFeatures()
  runStages(run, run.stage === 'code' ? 'coder' : run.stage)
}

/** A run marked running while no other orchestrator holds the lock was killed mid-stage (timeout, Ctrl-C, closed shell). */
function interrupted(run) {
  if (run.state !== 'running') return false
  if (otherRunning) fail(`run ${run.id} is still running (orchestrator pid ${otherRunning}). Wait for it to finish.`)
  return !['start', 'specify', 'review', 'done'].includes(run.stage)
}

function runStages(run, from) {
  const featureList = `Approved .feature files (your whole specification):\n${run.features.map((f) => `- ${f}`).join('\n')}`
  const stages = [
    ['coder', featureList],
    ['architect', `${featureList}\n\nClean up and restructure the code changed on this branch until the quality gate is green, and refresh the architecture map. ${architectHandoff(run)}`],
    ['security', `Scan and fix the dependencies and the code changed on this branch. Write your security note to ${join(run.dir, 'security-note.md')}.`],
    ['reviewer'],
    ['qa', `${featureList}\n\nQA procedures of this run:\n${changedProcedures().map((f) => `- ${f}`).join('\n') || '- (none changed: run the existing QA suite)'}`],
    ['hardener', `${featureList}\n\nKill surviving mutants. Run directory: ${run.dir}`],
    ['rereview'],
  ]
  const start = stages.findIndex(([role]) => role === from)
  if (start < 0) fail(`cannot resume from stage "${from}"`)
  for (const [role, task] of stages.slice(start)) {
    if (!runStage(run, role, task)) return
  }
  finish(run)
}

/** D47: the Reviewer runs after Security, so its fixes are QA-checked and mutation-tested; the re-review runs last. */
function runStage(run, role, task) {
  if (role === 'reviewer') return review(run)
  if (role === 'rereview') return rereview(run)
  return stage(run, role, task)
}

function fix(request, id) {
  const fromTracker = request === '--issue'
  if (!request) fail('fix needs a request')
  const run = fromTracker ? createRun('fix', readWorkItem(id), id) : createRun('fix', request)
  save(run, { stage: 'code', state: 'running' })
  fixStages(run, 'coder')
}

/** The small path: the Coder, then the Reviewer unless a human set review.onFix to false (D45). */
function fixStages(run, from) {
  const task = `Small fix. Request:\n\n${run.request}\n\nWrite a failing test first, then the fix.`
  if (from !== 'reviewer' && !stage(run, 'coder', task, { gate: config.pipeline.fixGate, scope: 'fix' })) return
  if (config.review.onFix !== false && !review(run)) return
  finish(run)
}

function status(id) {
  console.log(JSON.stringify(loadRun(id), null, 2))
}

/**
 * Knowledge stage (D32, D33). The knowledge base lives outside the repo, on each person's machine, and is
 * synced by its own tool, not git. So it is updated after merge, from the base branch: it covers every
 * commit since the last update (recorded in the knowledge base), so a skipped run is caught up next time.
 */
function knowledge() {
  if (config.knowledge?.enabled && config.knowledge.sync) return syncTracker()
  const kb = knowledgeDir(config)
  if (!config.knowledge?.enabled || !kb) fail('the knowledge stage is not enabled (knowledge.enabled, knowledge.dir)')
  if (!existsSync(kb.path)) fail(`knowledge base ${kb.path} not found. Set AGENT_KIT_KNOWLEDGE_DIR to where yours lives.`)
  if (git('branch', '--show-current') !== config.baseBranch) fail(`run this on ${config.baseBranch}, after pulling the merged changes`)
  if (git('status', '--porcelain')) fail('the working tree has uncommitted changes. The knowledge stage needs a clean checkout.')
  const gate = knowledgeGate()
  const marker = join(kb.path, config.knowledge.syncFile ?? '.agent-kit-sync.json')
  const last = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')).commit : null
  const head = git('rev-parse', 'HEAD')
  if (last === head) return console.log(`✓ knowledge base is up to date with ${head.slice(0, 8)}`)
  const range = last ? `${last}..${head}` : null
  const dir = join(runsDir, `${new Date().toISOString().slice(0, 10)}-knowledge-${head.slice(0, 8)}`)
  mkdirSync(dir, { recursive: true })
  agentLog = join(dir, 'agents.log')
  const conventions = config.knowledge.conventions ? `Its conventions: ${config.knowledge.conventions}` : ''
  const scope = range ? `Cover the merged changes in \`git log -p ${range}\`.` : 'This is the first update: describe the whole codebase as it is now.'
  const task = [`Knowledge base: ${kb.path}`, conventions, scope].filter(Boolean).join('\n')
  const max = config.pipeline.maxAttempts
  let feedback = ''
  for (let attempt = 1; attempt <= max; attempt++) {
    console.log(`▶ knowledge: attempt ${attempt}/${max}`)
    agent('knowledge', [rolePrompt('knowledge'), task, gateLine(gate), feedback].filter(Boolean).join('\n\n'), [kb.path])
    if (existsSync(resolve(root, 'STUCK.md'))) {
      renameSync(resolve(root, 'STUCK.md'), join(dir, 'STUCK-knowledge.md'))
      fail(`knowledge stopped and asked for a human: ${join(dir, 'STUCK-knowledge.md')}`)
    }
    if (git('status', '--porcelain') || git('rev-parse', 'HEAD') !== head) fail('the Knowledge agent changed files in the repo. It may only edit the knowledge base. Review and revert them.')
    const result = runGate(gate, { AGENT_KIT_KNOWLEDGE_DIR: kb.path, AGENT_KIT_KNOWLEDGE_RANGE: range ?? '' })
    if (result.ok) {
      writeFileSync(marker, `${JSON.stringify({ commit: head, updatedAt: new Date().toISOString() }, null, 2)}\n`)
      return console.log(`✓ knowledge base updated to ${head.slice(0, 8)}`)
    }
    feedback = `Attempt ${attempt} of ${max} failed the knowledge gate \`${gate}\`. Output (tail):\n\`\`\`\n${result.output.slice(-6000)}\n\`\`\``
  }
  writeFileSync(join(dir, 'STUCK.md'), `# STUCK: knowledge\n\n${feedback}\n`)
  fail(`knowledge is stuck after ${max} attempts: ${join(dir, 'STUCK.md')}`)
}

/**
 * Knowledge stage with a work-item tracker as the knowledge base. The sync command (knowledge.sync) updates the
 * work items linked from every change merged since its last sync, without an agent: it is deterministic, so it can
 * run in CI after each merge. It must be idempotent. The knowledge gate then checks every linked work item got its
 * summary.
 */
function syncTracker() {
  if (git('branch', '--show-current') !== config.baseBranch) fail(`run this on ${config.baseBranch}, after pulling the merged changes`)
  const gate = knowledgeGate()
  console.log('\n▶ knowledge: sync the work-item tracker')
  if (!runGate(config.knowledge.sync, {}, true).ok) fail('the tracker sync failed (knowledge.sync). It is safe to re-run.')
  if (!runGate(gate, {}, true).ok) fail(`the knowledge gate failed after the tracker sync: \`${gate}\``)
  console.log('\n✓ work-item tracker updated')
}

/** An enabled knowledge stage needs its gate (D39): an unchecked update would be reported as done. */
function knowledgeGate() {
  const gate = config.gates.knowledge
  if (!gate) fail('knowledge.enabled is true but gates.knowledge is null. Set the gate that checks the knowledge base.')
  if (isTodo(gate)) fail(`gate "knowledge" is not configured yet: ${gate}`)
  return gate
}

// ── stages ───────────────────────────────────────────────────────────────────

/**
 * One role, up to pipeline.maxAttempts tries at its gate. Options: `gate` overrides the role's gate, `at` names the
 * stage a stuck run resumes from (the Coder answering review findings resumes at the reviewer), `dirs` are extra
 * directories the agent may use.
 */
function stage(run, role, task, { gate = config.pipeline[role].gate, at = role, dirs, scope = role } = {}) {
  const max = config.pipeline.maxAttempts
  save(run, { stage: at, state: 'running' })
  const from = git('rev-parse', 'HEAD')
  let feedback = ''
  for (let attempt = 1; attempt <= max; attempt++) {
    console.log(`▶ ${role}: attempt ${attempt}/${max}`)
    const prompt = [rolePrompt(role), `Run id: ${run.id}`, task, gateLine(gate), feedback].filter(Boolean).join('\n\n')
    agent(role, prompt, dirs ?? (['architect', 'security', 'hardener'].includes(role) ? [run.dir] : []))
    if (agentGaveUp(run, role, at)) return false
    // The gate runs even when the scope check fails, so the retry learns both what to undo and what the gate wants.
    const result = runGate(`(${gate}) && node agent-kit/scripts/integrity-gate.mjs; gated=$?; ${scopeCheck(scope, from)} && [ $gated -eq 0 ]`)
    if (result.ok) {
      commit(run, `${role}: ${run.slug}`)
      console.log(`✓ ${role} passed its gate`)
      return true
    }
    feedback = [
      `Attempt ${attempt} of ${max} failed the gate \`${gate}\`. Output (tail):`,
      '```',
      result.output.slice(-6000),
      '```',
      'Fix the cause. Never weaken a gate, add ignores, or delete assertions.',
    ].join('\n')
  }
  const note = `# STUCK: ${role}\n\nRun: ${run.id}\nGate: \`${gate}\`\nAttempts: ${max}\n\n${feedback}\n`
  writeFileSync(join(run.dir, 'STUCK.md'), note)
  save(run, { state: 'stuck' })
  console.error(`\n✗ ${role} is stuck after ${max} attempts. A human takes over: ${join(run.dir, 'STUCK.md')}`)
  console.error(`  After fixing the cause: node agent-kit/scripts/orchestrate.mjs approve`)
  process.exitCode = 2
  return false
}

/** An agent that writes STUCK.md is asking a human a question (e.g. a contradictory spec). Retrying can't help. */
function agentGaveUp(run, role, at = role) {
  const note = resolve(root, 'STUCK.md')
  if (!existsSync(note)) return false
  const dest = join(run.dir, `STUCK-${role}.md`)
  renameSync(note, dest)
  save(run, { stage: at, state: 'stuck' })
  console.error(`\n✗ ${role} stopped and asked for a human: ${dest}`)
  console.error(`  Fix the cause (for a spec problem: edit the .feature files and commit), then: node agent-kit/scripts/orchestrate.mjs approve`)
  process.exitCode = 2
  return true
}

/**
 * The Specifier, up to pipeline.maxAttempts tries at the scope and spec gates (D49). A Specifier that wrote no
 * .feature file asked questions instead: nothing to check. False when the spec still fails after the last try.
 */
function writeSpec(run, prompt) {
  const gate = specGate()
  const max = config.pipeline.maxAttempts
  run.specFrom ??= git('rev-parse', 'HEAD')
  save(run, {})
  let feedback = ''
  for (let attempt = 1; attempt <= max; attempt++) {
    agent('specifier', [prompt, gateLine(gate), feedback].filter(Boolean).join('\n\n'), [run.dir])
    if (!changedFeatures().length) return true
    const result = runGate(`${scopeCheck('specifier', run.specFrom)} && ${gate}`)
    if (result.ok) return true
    feedback = `Attempt ${attempt} of ${max} failed the gate. Output (tail):\n\`\`\`\n${result.output.slice(-6000)}\n\`\`\``
  }
  return false
}

function specGate() {
  return config.pipeline.specifier?.gate ?? 'node agent-kit/scripts/verify.mjs --only spec'
}

/** What each role may change (D49). A role with no scope.roles entry passes. */
function scopeCheck(scope, from) {
  return `node agent-kit/scripts/scope-gate.mjs ${scope} ${from}`
}

/** The role's definition of done, from config, so no role file has to repeat it. */
function gateLine(gate) {
  return `Done when \`${gate}\` passes: the orchestrator runs it after you, together with the scope gate (what your role may change) and the integrity gate. Run it yourself before you stop.`
}

function architectHandoff(run) {
  const mode = config.review.mode
  if (mode === 'full') return `Humans read all code in this repo. Write the reading guide to ${join(run.dir, 'reading-guide.md')}.`
  return `Humans review only the Gherkin and architecture-facing changes. If classify says big, write an architecture note to ${join(run.dir, 'architecture-note.md')}: which protected paths changed (public feature APIs, contracts, shared code, dependencies) and why. No reading guide.`
}

function finish(run) {
  // D46: classify sees the Reviewer's findings, so a declined one on a protected path makes the change big.
  const env = { ...process.env, AGENT_KIT_REVIEW_DIR: join(run.dir, 'review') }
  const classify = spawnSync('node', [script('classify.mjs'), '--json'], { cwd: root, encoding: 'utf8', env })
  const size = JSON.parse(classify.stdout || '{"size":"big","reasons":["classify failed"]}')
  const policy = reviewPolicy(config, size.size)
  const doc = (name, missing) => {
    const file = join(run.dir, name)
    return existsSync(file) ? readFileSync(file, 'utf8') : `_${missing}_`
  }
  const sections = [
    `## ${run.kind === 'fix' ? 'Fix' : 'Feature'}: ${run.slug}`,
    '',
    `Size: **${size.size}**${size.reasons?.length ? ` (${size.reasons.join('; ')})` : ''} · Review mode: **${config.review.mode}**`,
    '',
    `**Human review:** ${policy.summary}`,
    '',
    run.workItem && config.tracker?.closeLine ? `${config.tracker.closeLine.replaceAll('{id}', run.workItem)}\n` : '',
    run.features?.length ? `### Scenarios\n${run.features.map((f) => `- \`${f}\``).join('\n')}\n` : '',
    run.procedures?.length ? `### QA procedures\n${run.procedures.map((f) => `- \`${f}\``).join('\n')}\n` : '',
  ]
  if (run.kind === 'feature' && config.review.specCritic !== false) sections.push(`### Spec critique\n${doc('spec-critic/critique.md', 'Missing: the Spec-critic did not write one.')}\n`)
  if (run.kind === 'feature') sections.push(`### Security\n${doc('security-note.md', 'Missing: the Security agent did not write one.')}\n`)
  if (policy.readingGuide) sections.push(`### Reading guide\n${doc('reading-guide.md', 'Missing: the Architect did not write one.')}\n`)
  if (policy.architectureNote) sections.push(`### Architecture note\n${doc('architecture-note.md', 'Missing: the Architect did not write one.')}\n`)
  if (run.kind === 'feature') sections.push(`### Equivalent mutants\n${doc('equivalent-mutants.md', 'None reported.')}\n`)
  const findings = readReview(join(run.dir, 'review', 'findings.json'))?.findings
  if (findings) sections.push(`### Review findings\n${reviewSummary(findings)}\n`)
  const usage = agentLog ? writeReport(dirname(agentLog)) : null
  if (usage) sections.push(`### Agent usage\n${usage.table}\n`)
  if (policy.explainBack) sections.push('### Explain-back (reviewer fills in before approving)\n_3–5 lines on how this change works._')
  if (config.knowledge?.enabled && config.knowledge.sync) sections.push('### Knowledge base\nAfter merging, `node agent-kit/scripts/orchestrate.mjs knowledge` on the base branch (CI runs it) posts a summary of this change to the linked work item and closes it.\n')
  else if (config.knowledge?.enabled) sections.push('### Knowledge base\nAfter merging, run `node agent-kit/scripts/orchestrate.mjs knowledge` on the base branch to update the knowledge base.\n')
  writeFileSync(join(run.dir, 'pr-body.md'), `${sections.join('\n')}\n`)
  save(run, { stage: 'done', state: 'ready-for-pr', size: size.size })
  console.log(`\n✓ pipeline done (${size.size}, review mode ${config.review.mode}). Human review: ${policy.summary}`)
  openPr(run)
}

/** The request's first sentence, cut at the last whole word before PR_TITLE_MAX characters. */
function prTitle(request) {
  const sentence = request.split('\n')[0].trim().split(/[.!?](?:\s|$)/)[0].trim()
  if (sentence.length <= PR_TITLE_MAX) return sentence
  return `${sentence.slice(0, PR_TITLE_MAX + 1).replace(/\s+\S*$/, '')}…`
}

/**
 * Pushes the run branch and opens the draft PR with pr.open, a shell command that gets the branch, title and body
 * file as $AGENT_KIT_BRANCH, $AGENT_KIT_PR_TITLE and $AGENT_KIT_PR_BODY, and prints the PR's URL last. With no
 * pr.open, it prints what to do by hand. A failed open keeps the run ready, so `approve` tries again.
 */
function openPr(run) {
  const body = join(run.dir, 'pr-body.md')
  const command = config.pr?.open
  if (run.pr) {
    console.log(`✓ draft PR: ${run.pr}`)
    return
  }
  if (!command) {
    console.log(`  Next: git push -u origin ${run.branch} and open a DRAFT PR with the body in ${body}.`)
    return
  }
  useRunBranch(run)
  const line = prTitle(run.request)
  const title = run.workItem && !line.includes(run.workItem) ? `${run.workItem}: ${line}` : line
  const result = runGate(command, { AGENT_KIT_BRANCH: run.branch, AGENT_KIT_PR_TITLE: title, AGENT_KIT_PR_BODY: body })
  if (!result.ok) {
    console.error(`✗ could not open the draft PR (pr.open). Fix the cause, then: node agent-kit/scripts/orchestrate.mjs approve`)
    process.exitCode = 4
    return
  }
  const url = result.output.trim().split('\n').pop()
  save(run, { state: 'pr-open', pr: url })
  console.log(`✓ draft PR: ${url}`)
}

// ── review (D45) ─────────────────────────────────────────────────────────────

/**
 * Reviewer stage (D45), after Security (D47), so bugs are fixed before QA and mutation tests pin the behavior. The
 * re-review after the Hardener covers what changed since, so the code that ships is still reviewed. Each round, review.hunters fresh
 * Reviewers hunt for candidate findings and one more verifies them: a finding stays only with proof. Then the
 * review gate judges. Open important findings go to the Coder, who fixes each with a failing test first or declines
 * it with a reason, and the normal gate must pass again. The next round reviews only the diff since the last one,
 * with the findings already posted. After pipeline.maxAttempts rounds, STUCK.md.
 */
function review(run, at = 'reviewer') {
  const gate = reviewGate()
  const hunters = reviewHunters(config)
  const base = baseRef(config)
  if (!base) fail(`the Reviewer needs a base branch to diff against (${config.baseBranch} or origin/${config.baseBranch}). Fetch it, or set AGENT_KIT_BASE.`)
  const dir = join(run.dir, 'review')
  mkdirSync(dir, { recursive: true })
  save(run, { stage: at, state: 'running' })
  const max = config.pipeline.maxAttempts
  let feedback = ''
  for (let round = 1; round <= max; round++) {
    console.log(`▶ ${at === 'rereview' ? 're-review' : 'reviewer'}: round ${round}/${max}`)
    const head = git('rev-parse', 'HEAD')
    const ctx = { run, dir, round, at, since: run.reviewedHead ?? base, posted: startRound(dir) }
    for (let n = 1; n <= hunters; n++) reviewer(ctx, huntTask(ctx, n))
    reviewer(ctx, verifyTask(ctx, hunters, feedback))
    const verified = mergeFindings(dir, ctx.posted, head, `${at === 'rereview' ? 'rr' : 'r'}${round}-`)
    if (verified) save(run, { reviewedHead: head })
    const result = runGate(`${gate} && node agent-kit/scripts/integrity-gate.mjs`, { AGENT_KIT_REVIEW_DIR: dir })
    if (result.ok) {
      console.log('✓ reviewer passed its gate')
      return true
    }
    feedback = `Round ${round} of ${max} failed the review gate \`${gate}\`. Output (tail):\n\`\`\`\n${result.output.slice(-6000)}\n\`\`\``
    if (round < max && verified && !answerFindings(run, dir, feedback, at)) return false
  }
  return reviewStuck(run, dir, feedback, at)
}

/**
 * Re-review (D47): QA and the Hardener ran after the Reviewer, so it reads what they changed, as the next round of
 * the same review. Skipped when every file changed since the review is a test (review.testFiles) or a QA script.
 */
function rereview(run) {
  const since = run.reviewedHead
  const changed = since ? git('diff', '--name-only', `${since}..HEAD`).split('\n').filter(Boolean) : null
  const tests = [...(config.review.testFiles ?? []), ...(config.qa?.scripts ?? [])]
  if (changed && changed.every((f) => matchesAny(f, tests))) {
    console.log(`✓ re-review skipped: ${changed.length ? 'only tests changed' : 'nothing changed'} since the review`)
    return true
  }
  return review(run, 'rereview')
}

/** The review stage needs its gate (D39): an unchecked review would be reported as done. */
function reviewGate() {
  const gate = config.pipeline.reviewer?.gate
  if (!gate) fail('pipeline.reviewer.gate is missing from agent-kit.config.json. Set it to the review level: node agent-kit/scripts/verify.mjs review')
  if (!config.gates.review) fail('gates.review is not set. The Reviewer stage needs it: node agent-kit/scripts/review-gate.mjs')
  if (isTodo(gate) || isTodo(config.gates.review)) fail('the review gate is not configured yet')
  return gate
}

/** Snapshots the findings already posted, then clears this round's outputs so a Reviewer that writes nothing fails. */
function startRound(dir) {
  const file = join(dir, 'findings.json')
  const posted = readReview(file)?.findings ?? readReview(join(dir, 'posted.json'))?.findings ?? []
  writeFileSync(join(dir, 'posted.json'), `${JSON.stringify({ findings: posted }, null, 2)}\n`)
  for (const name of readdirSync(dir).filter((f) => /^hunt-\d+\.json$/.test(f))) rmSync(join(dir, name))
  rmSync(file, { force: true })
  return posted
}

/** One fresh Reviewer run. It may write only to the review directory: a changed repo stops the run. */
function reviewer(ctx, task) {
  const prompt = [rolePrompt('reviewer'), `Run id: ${ctx.run.id}`, task].join('\n\n')
  const head = git('rev-parse', 'HEAD')
  agent('reviewer', prompt, [ctx.dir], { AGENT_KIT_WRITE_DIR: ctx.dir })
  if (!git('status', '--porcelain') && git('rev-parse', 'HEAD') === head) return
  save(ctx.run, { stage: ctx.at, state: 'stuck' })
  fail(`the Reviewer changed files in the repo. It may write only to ${ctx.dir}. Review and revert them, then: node agent-kit/scripts/orchestrate.mjs approve`)
}

function reviewInputs(ctx) {
  const { run, round, at, since, posted } = ctx
  const features = run.features ?? changedFeatures()
  return [
    `Round: ${round}`,
    `Request:\n\n${run.request}`,
    `Approved .feature files:\n${features.map((f) => `- ${f}`).join('\n') || '- (none in this run)'}`,
    `QA procedures of this run:\n${changedProcedures().map((f) => `- ${f}`).join('\n') || '- (none changed)'}`,
    `Diff to review: \`git diff ${since}..HEAD\`${round > 1 || at === 'rereview' ? ' (only what changed since the last round)' : ''}. You may read the whole repo.`,
    `Findings already posted (never repeat one):\n\`\`\`json\n${JSON.stringify(posted, null, 2)}\n\`\`\``,
  ].join('\n\n')
}

function huntTask(ctx, n) {
  return ['Mode: hunt', reviewInputs(ctx), `Output file: ${join(ctx.dir, `hunt-${n}.json`)}`].join('\n\n')
}

function verifyTask(ctx, hunters, feedback) {
  const hunts = Array.from({ length: hunters }, (_, i) => `- ${join(ctx.dir, `hunt-${i + 1}.json`)}`).join('\n')
  return [
    'Mode: verify',
    reviewInputs(ctx),
    `Candidate findings from the hunters:\n${hunts}`,
    'Write only the new verified findings. A finding that keeps the id of one already posted counts as a repeat and is dropped.',
    `Output file: ${join(ctx.dir, 'findings.json')}`,
    feedback,
  ].filter(Boolean).join('\n\n')
}

/** Adds the verifier's new findings to the ones already posted, for the commit it reviewed. False if it wrote none. */
function mergeFindings(dir, posted, head, prefix) {
  const file = join(dir, 'findings.json')
  const fresh = readReview(file)?.findings
  if (!fresh) return false
  const ids = new Set(posted.map((f) => f.id))
  // D49: the orchestrator numbers new findings and opens them, so no Reviewer has to get either right.
  const added = fresh.filter((f) => !ids.has(f.id)).map((f, i) => ({ ...f, id: `${prefix}${i + 1}`, status: 'open' }))
  const findings = [...posted, ...added]
  writeFileSync(file, `${JSON.stringify({ head, findings }, null, 2)}\n`)
  return true
}

/**
 * The Coder answers every open important finding, then the gate of the stage the review follows must pass again:
 * Security's for the review (QA and mutation come after it), the Hardener's for the re-review, fixGate on a fix.
 */
function answerFindings(run, dir, feedback, at) {
  const file = join(dir, 'findings.json')
  const open = (readReview(file)?.findings ?? []).filter((f) => f.severity === 'important' && f.status === 'open')
  const task = [
    'Answer the Reviewer\'s findings. For each open important finding below, either:',
    '- fix it: first a test that fails because of it, then the fix. Fix every instance of its `class`, not only the line it names. Then set its `status` to "fixed" and `fixTest` to the path of that test.',
    '- or decline it: set `status` to "declined" and `reason` to why the code is right as it is.',
    `Findings file: ${file}\nEdit only status, fixTest and reason in it.`,
    `Open important findings:\n\`\`\`json\n${JSON.stringify(open, null, 2)}\n\`\`\``,
    feedback,
  ].join('\n\n')
  const after = at === 'rereview' ? config.pipeline.hardener.gate : config.pipeline.security.gate
  const gate = run.kind === 'fix' ? config.pipeline.fixGate : after
  const before = readReview(file)
  const ok = stage(run, 'coder', task, { gate, at, dirs: [dir] })
  keepOnlyAnswers(file, before)
  return ok
}

/** D49: the Coder answers findings; only its status, fixTest and reason survive. Everything else is the Reviewer's. */
function keepOnlyAnswers(file, before) {
  const edited = new Map((readReview(file)?.findings ?? []).map((f) => [f.id, f]))
  const pick = (f) => Object.fromEntries(['status', 'fixTest', 'reason'].filter((k) => k in f).map((k) => [k, f[k]]))
  const findings = before.findings.map((f) => ({ ...f, ...(edited.has(f.id) ? pick(edited.get(f.id)) : {}) }))
  writeFileSync(file, `${JSON.stringify({ ...before, findings }, null, 2)}\n`)
}

function reviewStuck(run, dir, feedback, at) {
  const max = config.pipeline.maxAttempts
  const findings = readReview(join(dir, 'findings.json'))?.findings ?? []
  const open = findings.filter((f) => f.severity === 'important' && f.status === 'open')
  const note = [
    `# STUCK: ${at}`,
    '',
    `Run: ${run.id}`,
    `Rounds: ${max}`,
    `Findings: ${join(dir, 'findings.json')}`,
    '',
    `The review gate still fails after ${max} rounds. Reconsider the approach, not only the lines: the same class of finding keeps coming back.`,
    '',
    `## Open important findings\n\n\`\`\`json\n${JSON.stringify(open, null, 2)}\n\`\`\``,
    '',
    feedback,
  ].join('\n')
  writeFileSync(join(run.dir, 'STUCK.md'), `${note}\n`)
  save(run, { stage: at, state: 'stuck' })
  console.error(`\n✗ ${at} is stuck after ${max} rounds. A human takes over: ${join(run.dir, 'STUCK.md')}`)
  console.error(`  After fixing the cause: node agent-kit/scripts/orchestrate.mjs approve`)
  process.exitCode = 2
  return false
}

/** The PR body's Review findings section (D45): the count first, then what a human should read. */
function reviewSummary(findings) {
  if (!findings.length) return 'No findings.'
  const count = (status) => findings.filter((f) => f.status === status).length
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
  const where = (f) => `\`${f.file}:${f.line}\` (${oneLine(f.class)})`
  const list = (title, items, line) => (items.length ? `\n**${title}**\n${items.map(line).join('\n')}` : '')
  return [
    `${findings.length} found, ${count('fixed')} fixed, ${count('declined')} declined`,
    list('Declined', findings.filter((f) => f.status === 'declined'), (f) => `- ${where(f)}: ${oneLine(f.evidence)}\n  Reason: ${oneLine(f.reason)}`),
    list('Pre-existing (on the base branch too; not caused by this change)', findings.filter((f) => f.severity === 'pre-existing'), (f) => `- ${where(f)}: ${oneLine(f.evidence)}`),
    list('Fixed', findings.filter((f) => f.status === 'fixed'), (f) => `- ${where(f)}, test \`${f.fixTest}\``),
    list('Open nits (not blocking)', findings.filter((f) => f.severity === 'nit' && f.status === 'open'), (f) => `- ${where(f)}: ${oneLine(f.evidence)}`),
  ].join('\n')
}

// ── plumbing ─────────────────────────────────────────────────────────────────

function agent(role, prompt, extraDirs, env = {}) {
  // D48: each call gets its own output file and usage note in the run directory, then is measured.
  const call = agentLog && !process.env.AGENT_KIT_VERBOSE ? startCall(dirname(agentLog), role) : null
  const notes = call && config.usage?.notes !== false
  const fullPrompt = notes ? `${prompt}\n\n${noteTask(call.note)}` : prompt
  const dirs = notes ? [...extraDirs, dirname(call.note)] : extraDirs
  const template = process.env.AGENT_KIT_AGENT_CMD ? JSON.parse(process.env.AGENT_KIT_AGENT_CMD) : config.agent.command
  const args = template.flatMap((part) => {
    if (part === '{prompt}') return [fullPrompt]
    if (part === '{dirs}') return dirs.flatMap((d) => [config.agent.addDirFlag, d])
    return [part.replaceAll('{role}', role)]
  })
  if (agentLog) appendFileSync(agentLog, `\n── ${role} · ${new Date().toISOString()} ──\n`)
  const out = call ? openSync(call.raw, 'w') : 'inherit'
  // agent.unsetEnv: variables the agent must not inherit, e.g. one that makes it refuse to start inside a chat session.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !(config.agent.unsetEnv ?? []).includes(k)))
  const noteEnv = notes ? { AGENT_KIT_USAGE_NOTE: call.note } : {}
  const result = spawnSync(args[0], args.slice(1), { cwd: root, stdio: ['ignore', out, out], timeout: config.agent.timeoutMs, env: { ...inherited, AGENT_KIT_ROLE: role, ...env, ...noteEnv } })
  if (call) {
    closeSync(out)
    endCall(call, { config, log: agentLog, root })
    agentCalls++
  }
  if (result.error) agentFailed(role, result.error.code ?? result.error.message)
  if (result.status !== 0) agentFailed(role, result.status ?? result.signal)
}

/**
 * An agent process that exits non-zero (sign-in, usage limit, network, a crash) did nothing a gate should judge.
 * Retrying would burn every attempt in seconds and end in a misleading STUCK, so the run stops here instead.
 */
function agentFailed(role, code) {
  const log = agentLog && existsSync(agentLog) ? readFileSync(agentLog, 'utf8').trim().split('\n').slice(-3).join('\n') : ''
  const timedOut = code === 'ETIMEDOUT' ? ` It ran longer than agent.timeoutMs (${config.agent.timeoutMs} ms); raise that in agent-kit.config.json if the stage needs longer.` : ''
  const reason = `The ${role} agent exited with code ${code} before its work could be judged.${timedOut} Its last output:\n\n\`\`\`\n${log}\n\`\`\`\n\nThis is not a gate failure: fix the cause (sign-in, usage limit, network), then run the same command again.`
  if (activeRun?.state === 'running') {
    writeFileSync(join(activeRun.dir, 'STUCK.md'), `# STUCK: ${role} did not run\n\nRun: ${activeRun.id}\n\n${reason}\n`)
    save(activeRun, { state: 'stuck' })
    console.error(`\n✗ ${role} exited with code ${code}: ${join(activeRun.dir, 'STUCK.md')}`)
    console.error('  After fixing the cause: node agent-kit/scripts/orchestrate.mjs approve')
    process.exit(2)
  }
  fail(reason)
}

/** D48: when a command that ran agents ends (done, paused, stuck or failed), the run's usage report is rewritten. */
function reportUsage() {
  if (!agentCalls || !agentLog) return
  const report = writeReport(dirname(agentLog))
  if (report) console.log(report.line)
}

/**
 * Runs a gate. Its output tail is printed only on failure, unless `show` (e.g. a sync that reports what it did).
 * The parentheses send every part of a compound gate (`a && b`) to the captured output, not only the last one.
 */
function runGate(command, env = {}, show = false) {
  const result = spawnSync('sh', ['-c', `(${command}) 2>&1`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } })
  if (show || result.status !== 0) process.stdout.write(`${result.stdout.split('\n').slice(-15).join('\n')}\n`)
  return { ok: result.status === 0, output: result.stdout }
}

function changedProcedures() {
  const globs = config.qa?.procedures ?? []
  if (!globs.length) return []
  const base = baseRef(config)
  const tracked = base ? git('diff', '--name-only', base).split('\n') : []
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n')
  return [...new Set([...tracked, ...untracked])].filter((f) => f && matchesAny(f, globs)).sort()
}

function changedFeatures() {
  const base = baseRef(config)
  const tracked = base ? git('diff', '--name-only', base, '--', '*.feature').split('\n') : []
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', '*.feature').split('\n')
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort()
}

/** Answer, approve and resume continue a run on its own branch, never on whatever is checked out. */
function useRunBranch(run) {
  if (git('branch', '--show-current') === run.branch) return
  if (git('status', '--porcelain')) fail(`not on ${run.branch}, and the working tree has uncommitted changes. Commit or stash them first.`)
  git('checkout', '-q', run.branch)
}

/** Commits only on the run's branch: an agent that switched branches must not get its work committed elsewhere. */
function commit(run, message) {
  const current = git('branch', '--show-current')
  if (current !== run.branch) fail(`refusing to commit on "${current}": run ${run.id} belongs to ${run.branch}`)
  git('add', '-A')
  if (git('status', '--porcelain')) git('commit', '-q', '-m', message)
}

function createRun(kind, request, workItem) {
  if (git('status', '--porcelain')) fail('the working tree has uncommitted changes. A run starts from a clean checkout, so commit or stash them first (a request file belongs outside the repo).')
  const text = request.startsWith('@') ? readFileSync(resolve(root, request.slice(1)), 'utf8') : request
  const slug = text.split('\n')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'change'
  const id = `${new Date().toISOString().slice(0, 10)}-${slug}-${Math.random().toString(36).slice(2, 6)}`
  const dir = join(runsDir, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'request.md'), `${text}\n`)
  installHooks()
  // Every run gets its own branch from the base branch, so a new ticket never stacks on the last one's unmerged work.
  const branch = `${kind === 'fix' ? 'fix' : 'feat'}/${workItem ? `${workItem}-` : ''}${slug}-${id.slice(-4)}`
  git('checkout', '-q', '-b', branch, startPoint())
  const run = { id, kind, slug, dir, branch, request: text, ...(workItem ? { workItem } : {}) }
  save(run, { stage: 'start', state: 'running' })
  writeFileSync(currentRunFile(), `${id}\n`)
  agentLog = join(dir, 'agents.log')
  return run
}

/** The local base branch when it exists (it has the kit even before it is pushed), else the remote one, else HEAD. */
function startPoint() {
  for (const ref of [config.baseBranch, `origin/${config.baseBranch}`]) {
    try {
      git('rev-parse', '--verify', '-q', `${ref}^{commit}`)
      return ref
    } catch {}
  }
  return 'HEAD'
}

/** This repo's current run (the last one started here) is recorded inside .git, so it is never committed. */
function currentRunFile() {
  return resolve(root, git('rev-parse', '--git-dir'), 'agent-kit-current-run')
}

function isRun(id) {
  return Boolean(id) && existsSync(join(runsDir, id, 'run.json'))
}

function loadRun(id) {
  const current = existsSync(currentRunFile()) ? readFileSync(currentRunFile(), 'utf8').trim() : null
  const runId = id ?? current
  if (!runId) fail('no run started in this repo yet. Start one with: node agent-kit/scripts/orchestrate.mjs feature "<request>"')
  if (!isRun(runId)) fail(`no run ${runId} in ${runsDir}`)
  const run = JSON.parse(readFileSync(join(runsDir, runId, 'run.json'), 'utf8'))
  agentLog = join(run.dir, 'agents.log')
  return run
}

function save(run, patch) {
  activeRun = run
  Object.assign(run, patch, { updatedAt: new Date().toISOString() })
  writeFileSync(join(run.dir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`)
}

function rolePrompt(role) {
  const file = resolve(root, 'agent-kit/roles', `${role}.md`)
  return `${readFileSync(file, 'utf8')}\n\nAlso follow AGENTS.md at the repo root.`
}

/** D49: git itself refuses pushes to protected branches, force-pushes and forbidden files (git-hooks.mjs). */
function installHooks() {
  const result = spawnSync('node', [script('git-hooks.mjs'), 'install'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) fail(`could not install the git hooks: ${result.stderr.trim()}`)
  if (result.stderr.trim()) console.error(result.stderr.trim())
}

/** A lock file in the git dir while this command runs, so hooks (e.g. the agent adapter's Stop hook) can tell. */
/** The pid of another orchestrator that is running in this repo now, or null. */
function liveLock() {
  try {
    const lock = resolve(root, git('rev-parse', '--git-path', 'agent-kit-running'))
    const pid = Number(readFileSync(lock, 'utf8'))
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}

function holdLock() {
  let lock
  try {
    lock = resolve(root, git('rev-parse', '--git-path', 'agent-kit-running'))
  } catch {
    return
  }
  writeFileSync(lock, `${process.pid}\n`)
  process.on('exit', () => rmSync(lock, { force: true }))
}

function script(name) {
  return resolve(root, 'agent-kit/scripts', name)
}
