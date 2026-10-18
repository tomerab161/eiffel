#!/usr/bin/env node
// Work-item reader for GitLab issues (init --tracker gitlab). Kit-owned, like agent-kit/scripts.
//
//   node agent-kit/trackers/gitlab.mjs 42   prints the issue as JSON {title, body, url} for tracker.read,
//                                           so `orchestrate.mjs feature --issue 42` starts from it
//
// Runs the `glab` CLI, logged in to the project's GitLab (it reads the project from the git remote).
import { spawnSync } from 'node:child_process'

const [id] = process.argv.slice(2)

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!/^\d+$/.test(id ?? '')) fail(`not a GitLab issue number: "${id ?? ''}"`)
const result = spawnSync('glab', ['issue', 'view', id, '--output', 'json'], { encoding: 'utf8' })
if (result.error) fail(`could not run glab: ${result.error.message}. Install it and run \`glab auth login\`.`)
if (result.status !== 0) fail(`glab could not read issue ${id}: ${result.stderr.trim()}`)
const issue = JSON.parse(result.stdout)
console.log(JSON.stringify({ title: issue.title, body: issue.description ?? '', url: issue.web_url }))
