import { expect, it } from 'vitest';

import { polygonOf, rawCollection, rawDemand, square, validProperties } from './demands.support.ts';
import { DemandCollectionSchema, PositionSchema, RingSchema } from './schemas.ts';

// Flat tests (no describe blocks): mutation testing measures these. See AGENTS.md → Tests.

const accepts = (input: unknown): boolean => DemandCollectionSchema.safeParse(input).success;
const withProperty = (key: string, value: unknown): unknown =>
  rawCollection([rawDemand({ properties: { ...validProperties(), [key]: value } })]);
const withGeometry = (geometry: unknown): unknown =>
  rawCollection([{ type: 'Feature', properties: validProperties(), geometry }]);

it('reads a valid collection into plain demands, in order', () => {
  const first = rawDemand();
  const second = rawDemand({
    properties: { name: 'Delta Irrigation', country: 'Egypt', customer: 'Nile Farms' },
    geometry: polygonOf(square(30, 30, 2)),
  });

  expect(DemandCollectionSchema.parse(rawCollection([first, second]))).toEqual([
    { name: 'North Field Survey', country: 'Norway', customer: 'Acme Energy', polygon: [square(0, 0, 1)] },
    { name: 'Delta Irrigation', country: 'Egypt', customer: 'Nile Farms', polygon: [square(30, 30, 2)] },
  ]);
});

it('reads an empty collection as no demands', () => {
  expect(DemandCollectionSchema.parse(rawCollection([]))).toEqual([]);
});

it('drops details other than name, country, customer and polygon', () => {
  const [demand] = DemandCollectionSchema.parse(withProperty('priority', 'high'));

  expect(demand).toEqual({
    name: 'North Field Survey',
    country: 'Norway',
    customer: 'Acme Energy',
    polygon: [square(0, 0, 1)],
  });
});

it.each(['name', 'country', 'customer'])('rejects a %s with no visible text', (key) => {
  expect(accepts(withProperty(key, '   '))).toBe(false);
});

it.each(['name', 'country', 'customer'])('accepts a %s of one character', (key) => {
  expect(accepts(withProperty(key, 'A'))).toBe(true);
});

it.each(['name', 'country', 'customer'])('rejects a %s that is not text', (key) => {
  expect(accepts(withProperty(key, 42))).toBe(false);
});

it('rejects a demand without properties', () => {
  expect(accepts(rawCollection([{ type: 'Feature', geometry: polygonOf(square(0, 0, 1)) }]))).toBe(false);
});

it('rejects a demand that is not a GeoJSON feature', () => {
  expect(accepts(rawCollection([{ ...rawDemand(), type: 'Thing' }]))).toBe(false);
});

it('rejects a collection that is not a GeoJSON feature collection', () => {
  expect(accepts({ ...rawCollection([]), type: 'Collection' })).toBe(false);
});

it('rejects a geometry that is not a polygon', () => {
  expect(accepts(withGeometry({ type: 'MultiPolygon', coordinates: [[square(0, 0, 1)]] }))).toBe(false);
});

it('rejects a polygon without rings', () => {
  expect(accepts(withGeometry(polygonOf()))).toBe(false);
});

it('accepts a polygon with a hole', () => {
  expect(accepts(withGeometry(polygonOf(square(0, 0, 10), square(2, 2, 1))))).toBe(true);
});

it('rejects a ring of 3 positions', () => {
  expect(
    RingSchema.safeParse([
      [0, 0],
      [1, 0],
      [0, 0],
    ]).success,
  ).toBe(false);
});

it('accepts a closed ring of 4 positions', () => {
  expect(
    RingSchema.safeParse([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]).success,
  ).toBe(true);
});

it('rejects an open ring of 4 positions', () => {
  expect(
    RingSchema.safeParse([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]).success,
  ).toBe(false);
});

it.each([
  [[-180.000001, 0], false],
  [[-180, 0], true],
  [[180, 0], true],
  [[180.000001, 0], false],
  [[0, -90.000001], false],
  [[0, -90], true],
  [[0, 90], true],
  [[0, 90.000001], false],
])('position %j valid: %s', (position, valid) => {
  expect(PositionSchema.safeParse(position).success).toBe(valid);
});

it.each([
  [[0], false],
  [[0, 0], true],
  [[0, 0, 12.5], true],
  [[0, 0, 0, 0], false],
])('position %j valid: %s', (position, valid) => {
  expect(PositionSchema.safeParse(position).success).toBe(valid);
});

it('rejects a position holding something other than numbers', () => {
  expect(PositionSchema.safeParse([0, '0']).success).toBe(false);
});

it('rejects the whole collection when one demand is invalid', () => {
  expect(accepts(rawCollection([rawDemand(), rawDemand({ properties: { ...validProperties(), name: '' } })]))).toBe(
    false,
  );
});

it.each([
  ['a single demand', rawDemand()],
  ['a collection without features', { type: 'FeatureCollection' }],
  ['features that are not a list', { type: 'FeatureCollection', features: {} }],
  ['nothing', undefined],
  ['null', null],
])('rejects %s', (_, input) => {
  expect(accepts(input)).toBe(false);
});
