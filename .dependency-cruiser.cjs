// Architecture rules (D12, D27). Humans own this file: agents may not edit it (integrity gate).
// Every boundary in AGENTS.md → Architecture that a reviewer would otherwise have to read for is a rule here.
const WEB = '^apps/web/src';
const API = '^apps/api/src';
const WEB_OUTER = `${WEB}/(clients|components|hooks|types|lib|constants)/`;
const API_OUTER = `${API}/(shared|plugins|config|db)/`;
const TESTS = '\\.(test|steps|support|spec)\\.tsx?$';
const CONFIGS = '(^|/)[^/]+\\.config\\.(c|m)?[jt]s$';
const FASTIFY = 'node_modules/(fastify|@fastify/[^/]+|fastify-plugin|fastify-type-provider-zod)/';

const WEB_KINDS = ['clients', 'components', 'hooks', 'types', 'lib', 'constants'];
const FEATURE_KINDS = ['components', 'hooks', 'types', 'lib'];
const API_KINDS = ['shared', 'plugins', 'config', 'db'];
const INDEX = 'index\\.tsx?$';

/**
 * "Use index files": code outside a folder imports the folder's index.ts, never a file inside it.
 * Covers the web's outer folders and each feature's subfolders, the API's outer folders and the domain areas.
 * components/ui (generated primitives) is exempt. API modules are imported by file from app.ts (composition root).
 */
const indexRules = [
  ...WEB_KINDS.map((kind) => ({
    name: `use-index-web-${kind}`,
    comment: `Import ${kind}/ through ${kind}/index.ts from outside it.`,
    severity: 'error',
    from: { path: WEB, pathNot: `${WEB}/${kind}/` },
    to: { path: `${WEB}/${kind}/`, pathNot: [`${WEB}/${kind}/${INDEX}`, `${WEB}/components/ui/`] },
  })),
  ...FEATURE_KINDS.map((kind) => ({
    name: `use-index-feature-${kind}`,
    comment: `Inside a feature, import its ${kind}/ through ${kind}/index.ts from outside that subfolder.`,
    severity: 'error',
    from: { path: `${WEB}/features/([^/]+)/`, pathNot: `${WEB}/features/[^/]+/${kind}/` },
    to: { path: `${WEB}/features/$1/${kind}/`, pathNot: `${WEB}/features/$1/${kind}/${INDEX}` },
  })),
  ...API_KINDS.map((kind) => ({
    name: `use-index-api-${kind}`,
    comment: `Import ${kind}/ through ${kind}/index.ts from outside it.`,
    severity: 'error',
    from: { path: API, pathNot: `${API}/${kind}/` },
    to: { path: `${API}/${kind}/`, pathNot: `${API}/${kind}/${INDEX}` },
  })),
  {
    name: 'use-index-domain-areas',
    comment: 'A domain area imports another area only through its index.ts.',
    severity: 'error',
    from: { path: '^packages/domain/src/([^/]+)/' },
    to: {
      path: '^packages/domain/src/[^/]+/',
      pathNot: ['^packages/domain/src/$1/', `^packages/domain/src/[^/]+/${INDEX}`],
    },
  },
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── domain package ───────────────────────────────────────────────────────
    {
      name: 'domain-is-pure',
      comment:
        'packages/domain may import only itself and zod (test files also their test libraries). No framework, no I/O, no apps.',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: {
        pathNot: [
          '^packages/domain/src',
          'node_modules/zod/',
          'node_modules/(vitest|@vitest/[^/]+|fast-check|@amiceli/vitest-cucumber)/',
        ],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'apps-use-domain-index',
      comment: "Apps import '@app/domain' (packages/domain/src/index.ts), never a deeper file.",
      severity: 'error',
      from: { path: '^apps/' },
      to: { path: '^packages/domain/', pathNot: '^packages/domain/src/index\\.ts$' },
    },
    {
      name: 'apps-do-not-import-each-other',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'no-test-libs-in-production-code',
      comment: 'Test libraries only in *.test, *.steps, *.support and *.spec files (and tool configs).',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: [TESTS, CONFIGS] },
      to: {
        path: 'node_modules/(vitest|@vitest/[^/]+|fast-check|@amiceli/vitest-cucumber|@testing-library/[^/]+|happy-dom)/',
      },
    },

    {
      name: 'qa-scripts-use-the-ui-only',
      comment:
        'QA scripts (apps/web/e2e) drive the app through the browser. They never import app, API or domain code.',
      severity: 'error',
      from: { path: '^apps/web/e2e/' },
      to: { path: '^(apps|packages)/', pathNot: '^apps/web/e2e/' },
    },

    // ── web app (D27) ────────────────────────────────────────────────────────
    {
      name: 'web-features-are-isolated',
      comment: 'A web feature never imports another feature. Shared code moves to an outer folder (promotion rule).',
      severity: 'error',
      from: { path: `${WEB}/features/([^/]+)/` },
      to: { path: `${WEB}/features/`, pathNot: `${WEB}/features/$1/` },
    },
    {
      name: 'web-outer-folders-never-import-features',
      comment: 'clients/, components/, hooks/, types/, lib/ and constants/ are shared: no arrows back into features.',
      severity: 'error',
      from: { path: WEB_OUTER },
      to: { path: `${WEB}/features/` },
    },
    {
      name: 'web-app-imports-feature-index-only',
      comment: 'app/ (router, shell) imports each feature only through features/<name>/index.ts.',
      severity: 'error',
      from: { path: `${WEB}/app/` },
      to: { path: `${WEB}/features/`, pathNot: `${WEB}/features/[^/]+/index\\.tsx?$` },
    },
    {
      name: 'web-nothing-imports-app',
      comment: 'app/ is the composition root. Features and outer folders never import it.',
      severity: 'error',
      from: { path: `${WEB}/(features|clients|components|hooks|types|lib|constants)/` },
      to: { path: `${WEB}/app/` },
    },

    // ── api app (D27) ────────────────────────────────────────────────────────
    {
      name: 'api-modules-talk-through-services',
      comment:
        'A module may use another module only through its *.service.ts, never its repository, routes or internals.',
      severity: 'error',
      from: { path: `${API}/modules/([^/]+)/`, pathNot: TESTS },
      to: { path: `${API}/modules/`, pathNot: [`${API}/modules/$1/`, '\\.service\\.ts$'] },
    },
    {
      name: 'api-outer-folders-never-import-modules',
      comment: 'shared/, plugins/, config/ and db/ are used by modules, never the other way round.',
      severity: 'error',
      from: { path: API_OUTER },
      to: { path: `${API}/modules/` },
    },
    {
      name: 'api-services-are-framework-free',
      comment: 'A service holds the use case. It never imports Fastify, plugins or the HTTP layer.',
      severity: 'error',
      from: { path: '\\.service\\.ts$' },
      to: { path: [FASTIFY, `${API}/plugins/`, '\\.routes\\.ts$'] },
    },
    {
      name: 'api-services-use-repository-interfaces',
      comment: 'A service depends on its repository interface (type-only import), never the DB driver or db/.',
      severity: 'error',
      from: { path: '\\.service\\.ts$' },
      to: { path: ['node_modules/mongodb/', `${API}/db/`] },
    },
    {
      name: 'api-service-imports-repository-as-type-only',
      comment: 'Services get repositories injected, so they import the repository file for its interface only.',
      severity: 'error',
      from: { path: '\\.service\\.ts$' },
      to: { path: '\\.repository\\.ts$', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'api-routes-never-touch-the-db',
      comment: 'Routes call services. They never import a repository, db/ or the driver.',
      severity: 'error',
      from: { path: '\\.routes\\.ts$' },
      to: { path: ['\\.repository\\.ts$', `${API}/db/`, 'node_modules/mongodb/'] },
    },
    {
      name: 'api-only-repositories-and-db-use-the-driver',
      comment: 'MongoDB is used only by repositories, db/ and the mongo plugin.',
      severity: 'error',
      from: { path: API, pathNot: ['\\.repository\\.ts$', `${API}/db/`, `${API}/plugins/mongo\\.ts$`] },
      to: { path: 'node_modules/mongodb/', dependencyTypesNot: ['type-only'] },
    },

    ...indexRules,

    // ── hygiene ──────────────────────────────────────────────────────────────
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'not-to-unresolvable', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'no-orphans',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', CONFIGS, TESTS, '(^|/)main\\.tsx$', '(^|/)server\\.ts$', '(^|/)index\\.tsx?$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^(apps|packages)/[^/]+/dist/', '^coverage/', '^reports/', '\\.stryker-tmp'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'types', 'default'] },
  },
};
