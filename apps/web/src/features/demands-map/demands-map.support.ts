import type { Demand, Ring } from '@app/domain';

/** Reads the "(lon, lat)" pairs out of a step's text, in order. */
const positionsIn = (text: string): Ring =>
  [...text.matchAll(/\((-?\d[\d.]*), (-?\d[\d.]*)\)/g)].map((match): [number, number] => [
    Number(match[1]),
    Number(match[2]),
  ]);

/** A closed rectangle from (west, south) to (east, north). */
const rectangle = (...[west, south, east, north]: [number, number, number, number]): Ring => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

const demand = (name: string, outline: Ring, holes: Ring[] = []): Demand => ({
  name,
  country: 'Norway',
  customer: 'Acme Energy',
  polygon: [outline, ...holes],
});

export { demand, positionsIn, rectangle };
