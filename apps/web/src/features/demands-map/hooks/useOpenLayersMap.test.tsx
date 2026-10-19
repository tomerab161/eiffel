import { cleanup, fireEvent, screen } from '@testing-library/react';
import type Feature from 'ol/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import type Style from 'ol/style/Style.js';
import { afterEach, expect, it, vi } from 'vitest';

import {
  bodyRows,
  demandsFile,
  mapElement,
  openDemandsPage,
  polygons,
  sample,
  serveJson,
} from '../adapters/demands-page.support.tsx';
import { openLayersMapOf } from './index.ts';

const layerOf = (): VectorLayer => {
  const element = mapElement();
  const layer = openLayersMapOf(element)
    ?.getAllLayers()
    .find((candidate) => candidate instanceof VectorLayer);

  if (!(layer instanceof VectorLayer)) {
    throw new Error('the map has no vector layer');
  }

  return layer;
};

/** The z-index OpenLayers draws the feature with (0 when its style sets none). */
const zIndexOf = (feature: Feature): number => {
  const style = layerOf().getStyleFunction()?.(feature, 1) as Style;

  return style.getZIndex() ?? 0;
};

const noScroll = (): void => undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Review r1-5: the selected polygon must not be covered by a later-listed polygon that overlaps it.
it('draws the selected polygon above a later-listed polygon that overlaps it', async () => {
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(noScroll);
  serveJson(
    demandsFile([
      { ...sample('First'), box: [0, 0, 10, 10] },
      { ...sample('Second'), box: [5, 5, 15, 15] },
    ]),
  );
  openDemandsPage();
  await screen.findAllByRole('cell', { name: 'First' });

  fireEvent.click(bodyRows()[0] as HTMLElement);

  const [first, second] = polygons() as [Feature, Feature];

  expect(zIndexOf(first)).toBeGreaterThan(zIndexOf(second));
});
