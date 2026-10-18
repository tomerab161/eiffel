# QA: status page

Feature: `apps/web/src/features/status/status.feature`. Script: `apps/web/e2e/status.spec.ts`.

Setup: the app is running with a healthy API.

1. Open the app's home page (`/`).
   - You see a page titled **Status**.
2. Wait for the status line under the title.
   - It reads **All systems operational**.
