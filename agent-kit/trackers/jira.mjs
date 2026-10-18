#!/usr/bin/env node
// Work-item reader for Jira (init --tracker jira). Kit-owned, like agent-kit/scripts.
//
//   node agent-kit/trackers/jira.mjs PROJ-123   prints the issue as JSON {title, body, url} for tracker.read,
//                                               so `orchestrate.mjs feature --issue PROJ-123` starts from it
//
// Needs JIRA_URL (https://<site>.atlassian.net), JIRA_EMAIL and JIRA_API_TOKEN (an Atlassian API token) in the
// environment. The title starts with the issue key, so the PR title carries it too and Jira links the PR.
const [key] = process.argv.slice(2)
const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key ?? '')) fail(`not a Jira issue key: "${key ?? ''}" (expected something like PROJ-123)`)
if (!JIRA_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) fail('set JIRA_URL, JIRA_EMAIL and JIRA_API_TOKEN to read Jira issues')

const base = JIRA_URL.replace(/\/+$/, '')
const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
// API v2 returns the description as plain text (v3 returns a document tree).
const response = await fetch(`${base}/rest/api/2/issue/${key}?fields=summary,description`, {
  headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
}).catch((error) => fail(`could not reach Jira at ${base}: ${error.message}`))
if (!response.ok) fail(`Jira answered ${response.status} for ${key}. Check the key, and that your token can see the issue.`)
const { fields } = await response.json()
console.log(JSON.stringify({ title: `${key}: ${fields.summary}`, body: fields.description ?? '', url: `${base}/browse/${key}` }))
