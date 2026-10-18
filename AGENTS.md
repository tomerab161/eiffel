# AGENTS.md

Instructions for every coding agent in this repo. Only what no tool can enforce is written here. Git hooks, the agent's settings, the gates (`node agent-kit/scripts/verify.mjs`) and the orchestrator enforce everything else, and their errors say what to do. If this file and the code disagree, fix this file in the same change.

<!-- agent-kit: the IMAX-kit fork fills the stack sections below (TypeScript fullstack monorepo, review mode strict). -->

**Review mode: strict.** Nobody line-reads code here, so write code that a gate can prove, not code a reviewer must trust.

## When you're stuck

If a gate seems wrong, the spec is ambiguous or contradictory, or the job can't be done inside what your role may change, stop and write `STUCK.md` at the repo root: what blocks you, the output, what you tried, and what you think is wrong. Never work around a gate.

## Rules no gate checks

- Behavior starts as Gherkin, then unit tests, then code. Watch each test fail before you make it pass.
- Never call the network except the package registry.

## Architecture

Vertical slices: one self-contained folder per feature. `.dependency-cruiser.cjs` (the `arch` gate) enforces the import rules.

- New code starts inside the feature that needs it. When a second feature needs it, move it to the outer folder and update both imports in the same change. Never copy it.
- Pure rules live in pure files (no framework, no I/O, no clock, no network). UI, HTTP and DB code stays thin and calls them.
- Request/response shapes are defined once, as domain Zod schemas, and reused by both apps.

```
packages/domain/src/          shared contracts and pure rules; apps import '@app/domain' only
  <area>/{schemas,constants,rules,index}.ts   types are z.infer<> of the schemas, never hand-written
  shared/                     primitives used by several areas (error codes, ids, pagination)
apps/api/src/                 Fastify 5
  app.ts                      buildApp({ config, repositories? }): composition root, never listens
  config/                     env.ts parses the environment once into AppConfig
  plugins/  db/  shared/      zod provider, error handler, Mongo; the MongoDB client; code used by 2+ modules
  modules/<module>/           <module>.routes.ts → <module>.service.ts → <module>.repository.ts (no controller layer)
apps/web/src/                 React 19 + Vite, TanStack Router (code-based routes) + TanStack Query
  app/                        shell: providers, router, entry; imports only features/<feature>/index.ts
  clients/                    API client: getJson parses every response with a domain schema
  components/ hooks/ types/ lib/ constants/      shared, used by 2+ features
  features/<feature>/         index.ts, components/, hooks/, types/, lib/ (pure), constants.ts, <feature>.feature
apps/web/e2e/                 QA scripts (Playwright), one per QA procedure in qa/
```

- Services are built with factories (`createXService(repository)`), so tests pass an in-memory fake.
- Constants: contract values both apps need go in `packages/domain/src/<area>/constants.ts`, API-wide values in `apps/api/src/shared/constants.ts` and `apps/api/src/config/constants.ts`, a web feature's in `features/<feature>/constants.ts`.

## Security

- Every Fastify route declares a Zod `schema` for each input it reads (params, querystring, body, headers) and for its responses. Endpoints that need a caller check it in a `preHandler` auth guard, never inside the handler. Errors go through the error-handler plugin, never as a stack trace.
- Logs and user-facing errors carry no secrets, personal data or internals.
- MongoDB: never pass user input as a query object or operator (`$where`, `$regex`, `$expr`, or a raw object from the body). Repositories take schema-parsed values and build the filter themselves.
- When the API is exposed beyond localhost it needs `@fastify/helmet`, `@fastify/cors` with an explicit origin list, and `@fastify/rate-limit`: a dependency change a human approves.

## Tests

- Test behavior through public interfaces. Every rule needs a test on each side of its boundary (e.g. 59, 60 and 61 minutes).
- Domain Gherkin uses domain language only. Adapter Gherkin pins the API/UI contract and may name endpoints and status codes.
- Unit tests (mutation-measured): Vitest, `*.test.ts(x)` next to the code. Gherkin: `<name>.feature` + `<name>.steps.ts(x)` in the same folder, `loadFeature('<repo-relative path>')` (@amiceli/vitest-cucumber). Helpers, worlds and fakes: `*.support.ts(x)`. Property tests: fast-check. QA scripts: `apps/web/e2e/<name>.spec.ts`.
- vitest-cucumber runs each step as its own test: clean up per scenario (`AfterEachScenario`), not in `afterEach`.
- API tests build the real app with fakes: `buildApp({ config, repositories: { … } })`. Never a live MongoDB.
- Known-wrong behavior is pinned with `it.fails(...)` and a reference to the task.

## Stack and commands

TypeScript 5.9 (strict), Node ≥ 22, pnpm 10 workspaces + Turborepo. API: Fastify 5, Zod 4, MongoDB driver 7. Web: React 19, Vite 8, TanStack Router + Query. Imports use explicit `.ts`/`.tsx` extensions.

| Command | What |
|---|---|
| `pnpm dev` | API on :3000 and web on :5173; needs MongoDB at `MONGO_URL`, or run the API with `STORAGE=memory` |
| `pnpm test` | all unit and Gherkin tests |
| `pnpm format` | apply Biome formatting and safe fixes |
| `node agent-kit/scripts/map.mjs` | regenerate `docs/architecture.md` |
