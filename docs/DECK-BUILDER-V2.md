# Deck Builder v2 — review notes

Local branch: `feature/deck-builder-v2`, based on remote main commit `d8cf058f18507519cb777bf426ba172b332371db`. The original checkout contained only documentation; current source files and Git objects were recovered through the GitHub connector and verified against their blob/tree/commit hashes when terminal Git networking failed. No production service was modified. The owner authorized committing and pushing this feature branch for review. No merge or production deployment is authorized or performed.

## Implementation

- `components/deck-builder.tsx`: split library/editor; independently scrolling desktop panels, balanced tablet layout, mobile Library/Deck switch; eligible printing gallery, search, category/metadata/ownership filters, pagination, drag preview and destination feedback. Pointer, touch and keyboard sensors use dnd-kit. Buttons and selects provide equivalent add, quantity, move, reorder and remove actions.
- `lib/domain/deck-builder.ts`: category routing, exact printing add/increment payloads, catalog filters, known/unknown cost handling and display sorting. Category checks organize cards; they are not official format verification. Unknown types remain available through the original manual form.
- `components/decks-panel.tsx` and `components/deck-line-controls.tsx`: preserve creation, rename, deletion, duplication, mode changes, manual section labels, TSV preview/import/export and original allocation/printing controls. Controls moved into expandable details; none of these actions writes collection ownership except the existing explicit collection actions outside the builder.
- `components/workspace.tsx`, `components/workspace-context.tsx`, `app/actions.ts`: reuse authenticated server mutations, confirmed-write refresh, busy/error states; expose save status and prevent overlapping client requests. Layout changes use the same server action pathway with a separate authenticated transactional RPC.
- `lib/domain/workspace.ts`: type existing catalog `attributes` and additive line `display_order`. The existing snapshot already includes both via SQL `to_jsonb`; no catalog snapshot rewrite.
- `components/card-image.tsx`, `app/globals.css`: authorized-image gate retained, artwork loading/fallback, scoped dark gold/teal builder styling, reduced-motion handling and touch controls.
- `package.json`, `package-lock.json`: dnd-kit core/sortable/utilities and their accessibility dependency. Manifests checked against the upstream dnd-kit repository; published integrity hashes cross-checked against shadcn-ui's lockfile. Installation and normal lockfile regeneration remain unverified because npm network access was unavailable.
- `supabase/fixtures/local.sql`: synthetic normal-card type changed from `Test unit` to `Unit`, so production category logic does not need special test-only routing. Existing TEST ONLY names/provenance remain. This file is strictly opt-in for disposable test databases.
- `tests/deck-builder.test.mts`, `tests/ui/deck-builder.spec.ts`, `tests/integration/database.test.mts`, `tests/ui/modules.spec.ts`, `playwright.config.ts`: domain coverage, real-service interaction scenarios, migration/RLS coverage, updated lifecycle locators and touch-enabled mobile project.

## Inventory and migration

Apply `202610080003_deck_builder_layout.sql` to a disposable test database before review. It only adds `deck_cards.display_order` and `edit_deck_layout`; existing migrations, inventory RPCs, constraints, RLS, and personal records are retained.

The layout RPC authenticates ownership and takes the existing per-user advisory transaction lock. Moves preserve exact printing choice; merging requires identical planned printing IDs (including unresolved status). Source lines with reservations cannot move. Reordering requires exactly the current section's line IDs, rejects foreign/duplicate/stale lists, and only changes display order. Failure rolls back the entire move/merge. It never allocates inventory or transfers reservations.

Theorycraft works without ownership, displays hypothetical missing copies using the existing summary, and never reserves. Physical adds only composition: allocation remains explicit through original controls. Lower quantities/removal can fail when reservations still exist; the backend error instructs the user to release allocations. Counts never imply legality or Ready (DCK-1 through DCK-7).

Review migration on a backed-up test copy rather than resetting an existing database. Recovery: the preceding UI can continue using the existing RPCs with the additive column/function present. Do not drop schema objects or reset production to roll this UI back.

## Verification performed

| Check | Result |
| --- | --- |
| Existing + new domain tests | **14 passed** using Node 24 native TypeScript stripping and a temporary relative-import resolver; includes 5 new builder tests. |
| `git diff --check` | Passed. |
| `npm ci` | Blocked: proxy connection unavailable; offline retry failed with ENOTCACHED. |
| `npm run typecheck` | Attempted; blocked: Next/TypeScript dependencies not installed. |
| `npm run lint` | Attempted; blocked: ESLint not installed. |
| `npm test` | Attempted; blocked: tsx not installed. Native execution above is the actual passing check. |
| `npm run build` | Attempted; blocked: Next not installed. |
| `npm run test:db` | Attempted; blocked: Docker socket access denied. |
| `npm run test:ui` | Attempted; blocked: Node Playwright package unavailable (only unrelated Python Playwright CLI exists). |
| Desktop/mobile screenshots | **Not captured**: the application and real-service harness could not start. No mock screenshot is presented as working UI. |

The native test run used a temporary Node `registerHooks` resolver adding `.ts` to existing extensionless relative imports, then directly imported all three unit-test files. It changed no repository imports or scripts and executed all 14 named tests, including assertions. The standard npm commands above must still pass before approval.

## Pending review checks and limitations

On a permitted development machine, run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build`, `npm run test:ui`, and `npm run test:local`. The last command uses real disposable GoTrue/PostgREST/PostgreSQL services and runs authenticated desktop/mobile lifecycle and builder tests. New browser coverage exercises library drop, invalid drop, increment/decrement, keyboard drag, tap, touch drag at tablet width, filters, mutation failure, exact-printing allocation conflict, ownership preservation and responsive widths. These scenarios are written but **not executed** here.

`tests/ui/deck-builder.spec.ts` captures `deck-builder-desktop.png`, `deck-builder-mobile-deck.png`, and `deck-builder-mobile-library.png` in the corresponding Playwright test output directory during that real-service run. These images will use explicitly labeled TEST ONLY catalog fixtures and image fallbacks, not invented Riot artwork.

- The feature is implemented but is **not fully validated or ready to merge** until typecheck, lint, production build, real database tests, browser tests and visual review pass.
- Legality stays `Unverified`; no new format restrictions or numerical deck limits were invented.
- Cost filtering/sorting uses numeric `cards.attributes.cost` only. Missing or differently represented costs are unknown until catalog ingestion provides a normalized value.
- Optional/custom sections already saved on a deck remain visible. Sideboard/Bench are not automatically enabled without supported format information; users retain the original descriptive section form.
- Unknown card types require the manual form/catalog resolution; no category is guessed from a card name. Canonical card IDs remain separate from exact eligible printing IDs.
- No authorized production catalog/artwork or official format profile was supplied. Fixture tests cannot validate completeness of the official Proving Grounds checklist or artwork rights.
- Copies use the existing exact-printing reservation model. Failed allocation never marks copies allocated, and a failed/uncertain save leaves the last confirmed snapshot displayed. Review/reload before retrying an uncertain increment.
