# QA: demands map

Features: `apps/web/src/features/demands-map/adapters/demands-page.feature`, `apps/web/src/features/demands-map/adapters/map-table-sync.feature`. Script: `apps/web/e2e/demands-map.spec.ts`.

Setup: the app is running (`pnpm dev`) with the demands file that ships with the web app (20 demands). Use a browser window of 1280×720.

1. Open `/demands`.
   - You see a map with 20 polygons and, next to it, a table with the columns **Name**, **Country** and **Customer**.
   - The first row reads **North Field Survey**, **Norway**, **Acme Energy**.
   - No row and no polygon is highlighted. The map shows all 20 polygons, and together they fill most of the map's width or height.
   - The table has its own scroll bar and shows only some of the 20 rows. The page itself does not scroll: the map stays in place while you scroll the table.
2. Scroll the table to the bottom and click the row **Harbor Expansion**.
   - The row **Harbor Expansion** (Netherlands, Port Logistics) is highlighted.
   - The map zooms to that demand. Its polygon fills most of the map, is drawn highlighted, and sits in the middle of the map.
3. Scroll the table back to the top.
   - The row **Harbor Expansion** is out of view. **North Field Survey** is the first visible row.
4. Click the middle of the highlighted polygon on the map.
   - The table scrolls by itself until the row **Harbor Expansion** is visible. It is still the only highlighted row.
   - The map does not zoom or pan.
5. Scroll the table to the top and click the row **North Field Survey**.
   - **North Field Survey** is now the only highlighted row. **Harbor Expansion** is no longer highlighted.
   - The map zooms to the **North Field Survey** polygon, which is drawn highlighted. No other polygon is highlighted.
6. Press the map's zoom-out button until several polygons are visible. Then click a polygon that is not highlighted.
   - That polygon is now the only highlighted one.
   - The table scrolls to that demand's row, which is now the only highlighted row. **North Field Survey** is no longer highlighted.
   - The map does not zoom or pan.
7. Click the table's first row once to select it, then press **Tab** until the second row has keyboard focus, and press **Enter**.
   - The second row is the only highlighted row.
   - The map zooms to that demand's polygon, which is drawn highlighted.
