# Projects Chromium receipt — 2026-09-09

## Current final result (main's independent rerun)

After the cascade correction `623212e`, **2 passed, 0 failed, 26.0s** (desktop
11.5s, mobile 9.2s). The strict mobile geometry assertion remains unchanged and
passes on empty, restored and viewer states. Main inspected the final desktop
and mobile screenshots: the topbar no longer overlaps the Projects title.
The owned server stopped; TCP probe on port 5174 returned `ECONNREFUSED`.
Earlier failures and intermediate results below are historical evidence, not
the current result. Browser HTTP remains a fixture, not production Supabase.

## Earlier browser task runs (historical)

Run from the worktree root with the existing TypeScript Playwright dependency and installed Chromium:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts
```

Latest rerun after Newton's topbar source was declared stable: **1 passed, 1 failed, 24.3s** (desktop passed in 10.9s; mobile failed in 8.9s on the new non-overlap assertion). The preceding suite without that geometry assertion passed 2/2 in 31.9s. Desktop 1440×1000 and mobile viewport 375×812 use real headless Chromium 148.0.7778.96. This is viewport testing on a PC, not a real phone or mobile browser engine.

Each independent journey starts with empty projects/tasks. Real navigation and labeled forms create one TEST-SYNAPSE project and task, then edit project name and task title/status/date. The tests verify assignment, new HTTP reads after reload, task archive cancellation/confirmation/restoration, project archive confirmation and readonly tasks, restoration across reload, and a synthetic viewer with no mutation controls or requests. Each journey makes exactly eight fixture writes. Screenshots cover the populated task form, restored data and viewer state. DOM selectors were checked against Chromium accessibility snapshots.

This suite tests the UI and its HTTP contract against an in-memory fixture. It does **not** test real Supabase, auth, SQL, PostgreSQL persistence, RLS, concurrency, pagination beyond the first page, or production credentials. The separately reported SQL/PGlite results belong to main. The final run includes the draft-preservation source fix; these two journeys do not directly simulate a focus-triggered membership refresh while a draft is open.

## Isolation and limits

- Only `playwright.projects.config.ts` and this directory were authored by the browser task. No production source, backend, SQL, package, or other configuration edits; no commits/push.
- Test-only Vite uses the app root and React plugin, `configFile: false`, `envFile: false`, `envDir: false`, `mode: 'test'`, loopback port 5174, `strictPort: true`, and `reuseExistingServer: false`. It never loads the repository Vite config or env files. Only env filenames were inspected; no env contents, keys, accounts or real auth were used.
- All inherited `VITE_*` variables are cleared before assigning `VITE_PROJECTS_ENABLED=true`, `VITE_SUPABASE_URL=http://127.0.0.1:5174/__test_supabase`, a dummy `VITE_SUPABASE_ANON_KEY`, and `VITE_ORCHESTRATOR_URL=''`. These values are also explicit in the Playwright server config.
- The synthetic session is installed only in a fresh context on that exact origin. Projects/tasks exist only in the test-process HTTP fixture, never in browser localStorage or production demo code.
- Browser routing is installed before navigation and retained until context close. Service workers are blocked. Unknown requests fail teardown; only local application assets and the observed APIs are allowed. The shared shell gets an empty `/data.csv` and empty `org_agents`; membership and one profile are synthetic. There are no auth endpoint handlers or generic success fallbacks.
- All outbound HTTP is aborted. The exact existing Google Fonts stylesheet request is an explicit blocked exception, so screenshots use fallback fonts; any other outbound request fails. All WebSockets are closed without connecting, including the known loopback Vite HMR attempt; any unknown socket fails. Per-test network audits are attached to the report.
- One worker, no retries, 60s per test, 7s assertions/actions, 15s navigation, 30s server start, 180s entire suite. A separate Vite cache stays inside ignored test output.
- Playwright stopped its owned server. A post-run TCP probe returned `ECONNREFUSED` for `127.0.0.1:5174`.

## Verification evidence

Targeted RED: temporarily ignored the task PATCH in **the test fixture only**, then ran the command above with `--grep desktop`. Result: **1 failed** at the DOM assertion for `TEST-SYNAPSE tâche modifiée` (7s assertion timeout), demonstrating detection of an update that was not applied. Restored the original fixture statement immediately; the identical targeted command then gave **1 passed (16.3s)**. No fault switch or altered assertion remains. Initial reconnaissance also rejected unrecognized Vite asset/query requests until the allowlist matched the observed app contract; these were fixture setup failures, not claimed UI regressions.

Earlier full suite, before adding the topbar geometry assertion: **2 passed (31.9s)**. Projects source SHA-256 values for that run:

```text
ProjectsView.tsx  50B01F3BF2168CE7FA10B0E707E5C3A896AD573C74C2D746091E6FB23381FB84
projectRepo.ts   B49AA6DE02D05034CBD816E8ABAE06698A82405A7E2209A644B372A75C86D7D7
```

Targeted lint and strict TypeScript checks passed:

```powershell
node node_modules/eslint/bin/eslint.js playwright.projects.config.ts e2e-projects/fixture.ts e2e-projects/projects.spec.ts
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module ESNext --moduleResolution bundler --target ES2023 --types node playwright.projects.config.ts e2e-projects/fixture.ts e2e-projects/projects.spec.ts
```

## Local artifacts and visual finding

The generated HTML report is `e2e-projects/playwright-report/index.html`; screenshots are under `e2e-projects/test-results/`. Existing Git ignore rules exclude both directories (verified using `git check-ignore`). Do not commit generated artifacts. Main separately owns nested lint ignores and the Vitest cross-runner exclusion.

At 375px the shared topbar's import/export hint overlaps the import/export controls, visible in `mobile-restored.png`. This visual finding was reported to main; no source fix was made here. The Projects form and list remain operable, and the tested Projects region/page have no horizontal overflow. The passing functional checks do not certify the entire shared shell's visual layout.

## Mobile topbar regression — additional browser assertion

The mobile journey now checks the rendered geometry at 375×812: the topbar, import hint and import/export buttons must end before the Projects title starts; the hint must not intersect the buttons; and the topbar must reserve vertical space for its contents. All measured elements must be visible with nonzero dimensions. A 0.5px allowance covers subpixel rounding only. This check runs on empty Projects, restored data, and viewer state, with the same bounded assertion timeout.

Real-source RED, before Newton's topbar fix: `node node_modules/@playwright/test/cli.js test --config playwright.projects.config.ts --grep mobile` gave **1 failed**, specifically on the new geometry assertion. Import hint bottom **119px**, Projects title top **112px**; export button bottoms **121px**, with **16px** vertical overlap against the hint. The topbar source SHA-256 remained `48E16180CA37F72F487CD43A75465EA9F2636E556B3F815F4FFB1568DB340652` before/after the run. No production source or fixture fault was introduced for this RED.

Preserved RED screenshot and detailed failure: `e2e-projects/evidence.local/topbar-red.png` and `e2e-projects/evidence.local/topbar-red-error.md`. The directory is Git-ignored under the existing `*.local` rule; these artifacts survive subsequent Playwright runs. Post-fix GREEN has **not** been obtained.

The first source fix still failed the unchanged assertion: **1 passed / 1 failed (26.9s)**. The hint bottom moved to **170px**, the PDF button bottom to **146px**, while the Projects title still started at **112px**. Evidence is preserved as `evidence.local/topbar-first-fix.png` and `evidence.local/topbar-first-fix-error.md`. This was reported to main/Newton with the likely CSS cascade cause: `origin-system.css`, imported after `index.css`, regenerates Tailwind utilities such as `.h-24` with the same specificity as the initial mobile header rule.

After main confirmed the source was stable, the full command was run again without changing the assertion: **1 passed / 1 failed (24.3s)**, with the same geometry failure. Latest captures: `test-results/projects-mobile-empty-→-fo-17e49--→-archive-restore-→-viewer/mobile-topbar-empty.png` and the desktop task-form/restored/viewer screenshots. The mobile journey stops before creating records, so no latest successful mobile restored/viewer captures exist. Browser-owned source files remain untouched. Targeted lint and strict TypeScript checks passed after adding the assertion. The final result was reported to main for source-side follow-up.

Source hashes for both failed post-fix runs:

```text
Topbar.tsx  7563CFE1216EB953A1F8B66313C56B82B8AE0551E22875A1299D36096EB45F86
index.css   A8965B116ECEBC48EC1DA6AB79D2EF1B86C9A85D0E35482B0D5FB3CBA245E9E3
```
