/** A name, country or customer must show at least one character that is not whitespace. */
const hasVisibleText = (value: string): boolean => value.trim().length > 0;

const samePosition = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b.at(index));

/** A ring is closed when its last position repeats its first, number for number. */
const isClosedRing = (ring: readonly (readonly number[])[]): boolean => {
  const first = ring[0];
  const last = ring.at(-1);

  return first !== undefined && last !== undefined && samePosition(first, last);
};

export { hasVisibleText, isClosedRing };
