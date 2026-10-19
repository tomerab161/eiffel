// qa-procedure: qa/demands-map/demands-map.md
import { expect, type Locator, type Page, test } from '@playwright/test';

/*
 * The map is a canvas, so this script reads it the way a user does: by looking at it. Each check takes a screenshot of
 * the map and finds the drawn polygons by colour: plain demands are blue, the highlighted demand is amber.
 */

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Blob extends Box {
  centerX: number;
  centerY: number;
}

interface MapPicture {
  width: number;
  height: number;
  plain: Blob[];
  highlighted: Blob[];
}

interface Pixels {
  width: number;
  height: number;
  rgba: Buffer;
}

const VIEWPORT = { width: 1280, height: 720 };
const DEMAND_COUNT = 20;
/** "Most of the map": more than half of its width or height. */
const MOST = 0.5;
/** "In the middle of the map": its centre within a tenth of the map's size of the map's centre. */
const MIDDLE_TOLERANCE = 0.1;
/** Pixels a polygon may shift between two screenshots and still count as "did not move". */
const STILL_TOLERANCE_PX = 1;
const MAX_ZOOM_OUT_PRESSES = 10;
const MAX_TAB_PRESSES = 5;
const SEVERAL = 3;
const FAR_SCROLL_PX = 5000;
const SOME_SCROLL_PX = 200;
const CONTROL_MARGIN_PX = 2;
const MAX_SETTLE_TRIES = 20;

const NONE = 0;
const PLAIN = 1;
const HIGHLIGHTED = 2;
const NEIGHBOURS = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [dx, dy] as const));

/** How much bluer than red a pixel must be to count as a plain demand: any blue, its fill included. */
const ANY_BLUE = 50;
/**
 * Only the dark-blue outline. Zoomed out to all demands, each polygon is a few pixels of outline, and two demands a
 * pixel apart (Andes Copper Prospect and Atacama Lithium Flats) are told apart by the lighter pixels between them.
 */
const OUTLINE_BLUE = 110;

/** Amber (the highlighted style) is much redder than blue; blue (the plain style) is much bluer than red. */
const plainOrNone = (r: number, b: number, blueMargin: number): number => (b > r + blueMargin ? PLAIN : NONE);
type ColourKind = (r: number, g: number, b: number) => number;
type PixelKind = (index: number) => number;

const kindOf =
  (blueMargin: number): ColourKind =>
  (r, g, b) =>
    r > b + 80 && r > g + 30 ? HIGHLIGHTED : plainOrNone(r, b, blueMargin);

const inside = (x: number, y: number, box: Box): boolean =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/** Decodes the screenshot into raw pixels; the browser only does image decoding here. */
const pixelsOf = async (page: Page, png: Buffer): Promise<Pixels> => {
  const decoded = await page.evaluate(async (base64) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = new OffscreenCanvas(image.width, image.height).getContext('2d');

    context?.drawImage(image, 0, 0);
    const data = context?.getImageData(0, 0, image.width, image.height).data ?? new Uint8ClampedArray();
    const chunk = 0x8000;
    const chunks = Array.from({ length: Math.ceil(data.length / chunk) }, (_, part) =>
      String.fromCharCode(...data.subarray(part * chunk, (part + 1) * chunk)),
    );

    return { width: image.width, height: image.height, raw: btoa(chunks.join('')) };
  }, png.toString('base64'));

  return { width: decoded.width, height: decoded.height, rgba: Buffer.from(decoded.raw, 'base64') };
};

const kindAt =
  ({ width, rgba }: Pixels, masks: readonly Box[], colourKind: ColourKind): PixelKind =>
  (index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const masked = masks.some((mask) => inside(x, y, mask));

    return masked ? NONE : colourKind(rgba[index * 4] ?? 0, rgba[index * 4 + 1] ?? 0, rgba[index * 4 + 2] ?? 0);
  };

const classify = (pixels: Pixels, masks: readonly Box[], blueMargin: number): Uint8Array => {
  const kindOfPixel = kindAt(pixels, masks, kindOf(blueMargin));

  return Uint8Array.from({ length: pixels.width * pixels.height }, (_, index) => kindOfPixel(index));
};

const neighboursOf = (index: number, width: number, height: number): number[] => {
  const x = index % width;
  const y = Math.floor(index / width);

  return NEIGHBOURS.map(([dx, dy]) => [x + dx, y + dy] as const)
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height)
    .map(([nx, ny]) => ny * width + nx);
};

const blobAround = (members: readonly number[], width: number): Blob => {
  const box = members.reduce(
    (sofar, index) => ({
      left: Math.min(sofar.left, index % width),
      right: Math.max(sofar.right, index % width),
      top: Math.min(sofar.top, Math.floor(index / width)),
      bottom: Math.max(sofar.bottom, Math.floor(index / width)),
    }),
    { left: Number.POSITIVE_INFINITY, right: 0, top: Number.POSITIVE_INFINITY, bottom: 0 },
  );

  return { ...box, centerX: (box.left + box.right) / 2, centerY: (box.top + box.bottom) / 2 };
};

/** Each connected patch of one colour (touching pixels, diagonals included) is one drawn polygon. */
const blobsOf = (kinds: Uint8Array, kind: number, width: number): Blob[] => {
  const height = kinds.length / width;
  const seen = new Set<number>();
  const blobs: Blob[] = [];
  const unseenOfKind = (index: number): boolean => kinds.at(index) === kind && !seen.has(index);
  const flood = (start: number): Blob => {
    const members = [start];

    seen.add(start);
    for (const here of members) {
      const fresh = neighboursOf(here, width, height).filter(unseenOfKind);

      for (const index of fresh) {
        seen.add(index);
        members.push(index);
      }
    }

    return blobAround(members, width);
  };

  kinds.forEach((_, index) => {
    if (unseenOfKind(index)) {
      blobs.push(flood(index));
    }
  });

  return blobs;
};

const mapOf = (page: Page): Locator => page.getByRole('img', { name: 'Map of demands' });

const boxOf = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error('not on screen');
  }

  return box;
};

/** The map's own buttons (zoom in and out) are not polygons: leave them out of the picture. */
const controlMasks = async (map: Locator): Promise<Box[]> => {
  const mapBox = await boxOf(map);
  const controls = await map.locator('.ol-control:visible').all();

  return Promise.all(
    controls.map(async (control) => {
      const box = await boxOf(control);

      return {
        left: Math.floor(box.x - mapBox.x) - CONTROL_MARGIN_PX,
        top: Math.floor(box.y - mapBox.y) - CONTROL_MARGIN_PX,
        right: Math.ceil(box.x - mapBox.x + box.width) + CONTROL_MARGIN_PX,
        bottom: Math.ceil(box.y - mapBox.y + box.height) + CONTROL_MARGIN_PX,
      };
    }),
  );
};

/** Takes a picture of the map once it has stopped moving (two equal screenshots in a row). */
const lookAtMap = async (page: Page, blueMargin: number = ANY_BLUE): Promise<MapPicture> => {
  const map = mapOf(page);
  const shoot = (): Promise<Buffer> => map.screenshot({ animations: 'disabled', scale: 'css' });
  const settled = async (previous: Buffer, triesLeft: number): Promise<Buffer> => {
    const next = await shoot();
    const done = next.equals(previous) || triesLeft === 0;

    return done ? next : settled(next, triesLeft - 1);
  };
  const pixels = await pixelsOf(page, await settled(await shoot(), MAX_SETTLE_TRIES));
  const kinds = classify(pixels, await controlMasks(map), blueMargin);

  return {
    width: pixels.width,
    height: pixels.height,
    plain: blobsOf(kinds, PLAIN, pixels.width),
    highlighted: blobsOf(kinds, HIGHLIGHTED, pixels.width),
  };
};

const union = (blobs: readonly Blob[]): Box => ({
  left: Math.min(...blobs.map((b) => b.left)),
  top: Math.min(...blobs.map((b) => b.top)),
  right: Math.max(...blobs.map((b) => b.right)),
  bottom: Math.max(...blobs.map((b) => b.bottom)),
});

const fillsMost = (box: Box, picture: MapPicture): boolean =>
  box.right - box.left > MOST * picture.width || box.bottom - box.top > MOST * picture.height;

const onlyHighlighted = (picture: MapPicture): Blob => {
  expect(picture.highlighted, 'exactly one polygon is drawn highlighted').toHaveLength(1);

  return picture.highlighted[0] as Blob;
};

const expectZoomedTo = (picture: MapPicture): void => {
  const polygon = onlyHighlighted(picture);

  expect(fillsMost(polygon, picture), 'the highlighted polygon fills most of the map').toBe(true);
  expect(Math.abs(polygon.centerX - picture.width / 2), 'centred across').toBeLessThan(
    MIDDLE_TOLERANCE * picture.width,
  );
  expect(Math.abs(polygon.centerY - picture.height / 2), 'centred down').toBeLessThan(
    MIDDLE_TOLERANCE * picture.height,
  );
};

const expectNear = (actual: Blob, expected: Blob): void => {
  expect(Math.abs(actual.centerX - expected.centerX)).toBeLessThanOrEqual(STILL_TOLERANCE_PX);
  expect(Math.abs(actual.centerY - expected.centerY)).toBeLessThanOrEqual(STILL_TOLERANCE_PX);
};

const byPosition = (a: Blob, b: Blob): number => a.centerX - b.centerX || a.centerY - b.centerY;

const expectSameView = (before: MapPicture, after: MapPicture): void => {
  const was = [...before.plain, ...before.highlighted].sort(byPosition);
  const is = [...after.plain, ...after.highlighted].sort(byPosition);

  expect(is, 'the map did not zoom or pan').toHaveLength(was.length);
  is.forEach((blob, index) => {
    expectNear(blob, was.at(index) as Blob);
  });
};

const clickOnMap = async (page: Page, point: Blob): Promise<void> => {
  const box = await boxOf(mapOf(page));

  await page.mouse.click(box.x + point.centerX, box.y + point.centerY);
};

const distance = (a: Blob, b: Blob): number => Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);

/** Harbor Expansion lies south and a little west of North Field Survey: the nearest polygon below and to the left. */
const southWestNeighbour = (picture: MapPicture, from: Blob): Blob => {
  const [nearest] = picture.plain
    .filter((b) => b.centerY > from.centerY && b.centerX < from.centerX)
    .sort((a, b) => distance(a, from) - distance(b, from));

  if (!nearest) {
    throw new Error('no polygon south-west of North Field Survey is visible');
  }

  return nearest;
};

/** Presses the map's zoom-out button until several plain polygons are visible. */
const zoomOutUntilSeveral = async (page: Page, pressesLeft: number): Promise<MapPicture> => {
  const picture = await lookAtMap(page);
  const done = picture.plain.length >= SEVERAL || pressesLeft === 0;

  if (!done) {
    await mapOf(page).getByTitle('Zoom out').click();
  }

  return done ? picture : zoomOutUntilSeveral(page, pressesLeft - 1);
};

const tabUntilFocused = async (page: Page, target: Locator, pressesLeft: number): Promise<void> => {
  const focused = await target.evaluate((element) => element === document.activeElement);

  if (!focused && pressesLeft > 0) {
    await page.keyboard.press('Tab');
    await tabUntilFocused(page, target, pressesLeft - 1);
  }
};

const pageScrolls = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);

interface TableView {
  table: Locator;
  scrollArea: Locator;
  rows: Locator;
  row: (name: string) => Locator;
  highlightedRows: Locator;
  scrollTop: () => Promise<number>;
  scrollBy: (deltaY: number) => Promise<void>;
}

const tableOf = (page: Page): TableView => {
  const table = page.getByRole('table');
  const scrollArea = page.locator('[data-table-scroll-area]');
  const rows = table.locator('tbody').getByRole('row');

  return {
    table,
    scrollArea,
    rows,
    row: (name: string): Locator => rows.filter({ hasText: name }),
    highlightedRows: table.locator('tbody tr[aria-selected="true"]'),
    scrollTop: (): Promise<number> => scrollArea.evaluate((element) => element.scrollTop),
    scrollBy: async (deltaY: number): Promise<void> => {
      await scrollArea.hover();
      await page.mouse.wheel(0, deltaY);
    },
  };
};

test('the demands map and table stay in sync', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const { table, scrollArea, rows, row, highlightedRows, scrollTop, scrollBy } = tableOf(page);

  // Step 1: open /demands.
  await page.goto('/demands');
  await expect(rows).toHaveCount(DEMAND_COUNT);
  await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Country', 'Customer']);
  await expect(rows.first().getByRole('cell')).toHaveText(['North Field Survey', 'Norway', 'Acme Energy']);
  await expect(highlightedRows).toHaveCount(0);
  const overview = await lookAtMap(page, OUTLINE_BLUE);

  expect(overview.highlighted, 'no polygon is highlighted').toHaveLength(0);
  expect(overview.plain, 'the map shows all 20 polygons').toHaveLength(DEMAND_COUNT);
  expect(fillsMost(union(overview.plain), overview), 'together they fill most of the map').toBe(true);
  // The table has its own scroll bar and shows only some rows; the page itself does not scroll.
  expect(await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(rows.first()).toBeInViewport();
  await expect(rows.last()).not.toBeInViewport();
  expect(await pageScrolls(page), 'the page itself does not scroll').toBe(false);
  const mapBefore = await boxOf(mapOf(page));

  await scrollBy(SOME_SCROLL_PX);
  await expect.poll(scrollTop).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await boxOf(mapOf(page)), 'the map stays in place').toEqual(mapBefore);

  // Step 2: scroll the table to the bottom and click Harbor Expansion.
  await scrollBy(FAR_SCROLL_PX);
  await expect(row('Harbor Expansion')).toBeInViewport();
  await row('Harbor Expansion').click();
  await expect(highlightedRows).toHaveCount(1);
  await expect(highlightedRows.getByRole('cell')).toHaveText(['Harbor Expansion', 'Netherlands', 'Port Logistics']);
  const harbor = await lookAtMap(page);

  expectZoomedTo(harbor);

  // Step 3: scroll the table back to the top.
  await scrollBy(-FAR_SCROLL_PX);
  await expect.poll(scrollTop).toBe(0);
  await expect(row('Harbor Expansion')).not.toBeInViewport();
  await expect(rows.first()).toHaveText(/North Field Survey/);
  await expect(rows.first()).toBeInViewport();

  // Step 4: click the middle of the highlighted polygon.
  await clickOnMap(page, onlyHighlighted(harbor));
  await expect(row('Harbor Expansion')).toBeInViewport();
  await expect(highlightedRows).toHaveCount(1);
  await expect(highlightedRows).toHaveText(/Harbor Expansion/);
  expectSameView(harbor, await lookAtMap(page));

  // Step 5: scroll the table to the top and click North Field Survey.
  await scrollBy(-FAR_SCROLL_PX);
  await expect.poll(scrollTop).toBe(0);
  await row('North Field Survey').click();
  await expect(highlightedRows).toHaveCount(1);
  await expect(highlightedRows).toHaveText(/North Field Survey/);
  expectZoomedTo(await lookAtMap(page));

  // Step 6: zoom out until several polygons show, then click one that is not highlighted.
  const zoomedOut = await zoomOutUntilSeveral(page, MAX_ZOOM_OUT_PRESSES);

  expect(zoomedOut.plain.length, 'several polygons are visible').toBeGreaterThanOrEqual(SEVERAL);
  const target = southWestNeighbour(zoomedOut, onlyHighlighted(zoomedOut));

  await clickOnMap(page, target);
  await expect(highlightedRows).toHaveCount(1);
  await expect(highlightedRows).toHaveText(/Harbor Expansion/);
  await expect(row('Harbor Expansion')).toBeInViewport();
  await expect(row('North Field Survey')).toHaveAttribute('aria-selected', 'false');
  const picked = await lookAtMap(page);

  expectNear(onlyHighlighted(picked), target);
  expectSameView(zoomedOut, picked);

  // Step 7: click the first row, Tab to the second row, press Enter.
  await rows.first().click();
  await expect(highlightedRows).toHaveText(/North Field Survey/);
  await tabUntilFocused(page, rows.nth(1), MAX_TAB_PRESSES);
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(highlightedRows).toHaveCount(1);
  await expect(highlightedRows).toHaveText(/Delta Irrigation/);
  expectZoomedTo(await lookAtMap(page));
});
