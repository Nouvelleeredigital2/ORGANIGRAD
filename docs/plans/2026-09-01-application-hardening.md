# Application Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the audited production-readiness corrections into `master` and close every remaining code-level defect that can be verified locally.

**Architecture:** Preserve Supabase as the source of truth. Use optimistic concurrency with `updated_at` at both SPA and orchestrator write paths, return explicit conflict errors, and keep notification capabilities truthful by removing the unsupported WhatsApp channel. Import the already prepared audited branch in a controlled merge, without touching local ignored environments or generated Supabase directories.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, Fastify, PostgreSQL/Supabase, ESLint, SheetJS.

---

### Task 1: Integrate audited corrections

**Files:**
- Modify: repository history by merging `codex/production-readiness`
- Preserve: `.env.local`, `.env.connected`, `supabase/.temp`, `supabase/.branches`

**Step 1:** Confirm the working tree contains only the design commit and existing untracked local artifacts.

**Step 2:** Merge `codex/production-readiness` into `master`, resolving only genuine overlaps and never staging local environments or generated artifacts.

**Step 3:** Inspect the merge diff for the SheetJS vendor package, connected E2E suite, CI, notification idempotence, Realtime sharing, and audit security migrations.

**Step 4:** Run focused frontend/orchestrator typechecks to catch merge errors.

**Step 5:** Commit the merge if Git does not create a merge commit automatically.

### Task 2: Make generated Supabase artifacts invisible to quality checks

**Files:**
- Modify: `.gitignore`
- Modify: `eslint.config.js`

**Step 1:** Add a regression check or shell assertion that `supabase/.temp` and `supabase/.branches` are not lint inputs.

**Step 2:** Run `npm run lint` and verify the generated one-line Edge runtime is not reported.

**Step 3:** Add `supabase/.temp/` and `supabase/.branches/` to Git ignores, keeping existing files untouched.

**Step 4:** Re-run lint and commit the hygiene change.

### Task 3: Validate node identifiers as UUIDs

**Files:**
- Test: `orchestrator/tests/dto.test.ts` or the existing DTO validation test file
- Modify: `orchestrator/src/api/dto.ts`

**Step 1:** Add a failing test proving a non-UUID node id is rejected with `NodeMutationValidationError` on field `id`.

**Step 2:** Run only the DTO test and verify the expected failure.

**Step 3:** Add strict UUID format validation while retaining the existing length/type validation.

**Step 4:** Re-run the focused test and the orchestrator typecheck.

### Task 4: Remove unsupported WhatsApp notification state

**Files:**
- Test: `src/services/notificationService.test.ts`, DTO tests, and any affected type tests
- Modify: `src/types/hybridNode.ts`
- Modify: `orchestrator/src/domain/types.ts`
- Modify: `src/services/notificationService.ts`
- Modify: `orchestrator/src/api/dto.ts`
- Modify: related database mapping/types only where required by TypeScript

**Step 1:** Add failing tests proving public notification DTOs and frontend notification results no longer expose or classify WhatsApp as an available channel.

**Step 2:** Run the focused tests and verify they fail against the current `whatsappId` behavior.

**Step 3:** Remove `whatsappId` from the shared notification types, validators, DTO indicators, drivers, and deferred-channel logic.

**Step 4:** Re-run focused tests, typechecks, and search for remaining production references.

### Task 5: Add optimistic concurrency to node updates

**Files:**
- Test: `src/services/hybridNodeRepo.test.ts`
- Test: `orchestrator/tests/concurrentWrites.integration.test.ts` or a hermetic store test
- Modify: `src/types/hybridNode.ts`
- Modify: `src/services/hybridNodeRepo.ts`
- Modify: `src/services/orchestratorService.ts`
- Modify: `orchestrator/src/api/dto.ts`
- Modify: `orchestrator/src/state/pgGraphStore.ts`
- Modify: editor error handling components as required by the existing mutation API

**Step 1:** Add failing tests for stale `updated_at` writes at the SPA and orchestrator paths.

**Step 2:** Run the focused tests and verify they fail because current upserts overwrite the newer row.

**Step 3:** Carry the loaded row version through the mutation payload and update with `id`, `workspace_id`, and `updated_at` predicates. Return a typed conflict error when zero rows are updated.

**Step 4:** Make the editor preserve the form and display a reload/conflict message instead of reporting success.

**Step 5:** Re-run focused tests, then the full frontend and orchestrator suites.

### Task 6: Full verification and handoff

**Files:**
- No additional production changes unless verification identifies a regression.

**Step 1:** Run frontend lint, typecheck, tests, and build.

**Step 2:** Run orchestrator typecheck, tests, and build.

**Step 3:** Run the isolated PostgreSQL integration scripts where Docker is available.

**Step 4:** Inspect `git status` and confirm no local environment or generated Supabase artifact was staged.

**Step 5:** Report remaining external actions separately: Vercel publication, Supabase/Resend configuration, production migration verification, and connected E2E execution.
