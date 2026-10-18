---
description: Approve the spec and run the rest of the pipeline to a draft PR. Also continues a stuck run.
allowed-tools: Bash(node agent-kit/scripts/orchestrate.mjs:*), Read
---

1. Run `node agent-kit/scripts/orchestrate.mjs approve` with the Bash tool's `run_in_background` option. It commits the user's edits, runs every remaining stage as a separate agent process, and opens the draft PR. It can take a long time. Don't poll it and don't read its log; wait for it to finish.
2. When it finishes:
   - **Exit 0.** Give the draft PR link, the one-line human review summary and the `📊 usage` line it printed. Nothing else.
   - **Exit 2.** A stage is stuck. Also give the `📊 usage` line it printed. Read the STUCK file it printed and explain in two or three plain sentences what is wrong and what the user could change. End with: "Fix it (or tell me what to change), then type /approve again." If the user asks you to fix it, make the change, then run step 1 again.
   - **Exit 4.** The pipeline passed but the PR didn't open. Show the error and say /approve will try again.
   - **Anything else.** Show the error line in one or two sentences.
