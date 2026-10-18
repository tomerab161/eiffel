// Public API of the domain. Apps import from '@app/domain' only, never a deeper path (enforced by .dependency-cruiser.cjs).
export * from './health/index.ts';
export * from './shared/index.ts';
