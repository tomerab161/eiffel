# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Run the pipeline roles (`.claude/agents/`) only through `/ticket` and `/approve` or `node agent-kit/scripts/orchestrate.mjs`, never by hand, so each role starts fresh with only its own inputs.
