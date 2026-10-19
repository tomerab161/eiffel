/** A name, country or customer must show at least one character that is not whitespace. */
const hasVisibleText = (value: string): boolean => value.trim().length > 0;

/**
 * A ring is closed when it has positions and its last repeats its first, number for number.
 * Positions hold finite numbers only, so two are equal exactly when their JSON text is.
 */
const isClosedRing = (ring: readonly (readonly number[])[]): boolean =>
  ring.length > 0 && JSON.stringify(ring.at(0)) === JSON.stringify(ring.at(-1));

export { hasVisibleText, isClosedRing };
