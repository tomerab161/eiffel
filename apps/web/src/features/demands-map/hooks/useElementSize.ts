import { type RefObject, useLayoutEffect, useState } from 'react';

import { type MapSize, mapSizeOf } from '../lib/index.ts';

/** The element's size in pixels, kept up to date as it resizes. */
const useElementSize = (ref: RefObject<HTMLElement | null>): MapSize => {
  const [size, setSize] = useState<MapSize>(() => mapSizeOf(0, 0));

  useLayoutEffect(() => {
    const element = ref.current;
    const measure = (): void => {
      setSize(mapSizeOf(element?.clientWidth ?? 0, element?.clientHeight ?? 0));
    };
    const observer = new ResizeObserver(measure);

    if (element) {
      measure();
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [ref]);

  return size;
};

export { useElementSize };
