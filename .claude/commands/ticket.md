---
description: Start the agent pipeline from a ticket. Stops at the spec for your review.
argument-hint: <ticket id, or the ticket text>
allowed-tools: Bash(node agent-kit/scripts/orchestrate.mjs:*), Read
---

1. Run `node agent-kit/scripts/orchestrate.mjs feature '<the text below>'` (an id reads the ticket from the tracker) with the Bash tool's `run_in_background` option, and wait for it to finish. Don't poll it and don't read its log. Pass the text unchanged as one shell argument: inside the single quotes, write each `'` as `'\''`.

   ```
   $ARGUMENTS
   ```
2. When it finishes:
   - **Exit 0.** List the `.feature` and QA procedure files it printed as clickable links, one per line, and the Spec-critic's file if it printed one. Then say: "Read these and edit anything that's wrong, then type /approve." Don't summarize or change the files unless the user asks.
   - **Exit 3.** The Specifier has questions. Read the `tasks.md` it printed and show only the questions, as a short numbered list. When the user answers, run `node agent-kit/scripts/orchestrate.mjs answer '<their answers>'` the same way (same quoting), then go back to step 2.
   - **Anything else.** Show the error line and what it asks for, in one or two sentences.

Keep every reply short, and never do the pipeline agents' work in this chat.
