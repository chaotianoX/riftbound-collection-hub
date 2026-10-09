# Community catalog ingestion

Feature branch: `feature/catalog-ingestion`. Criteria: COL-4/6/8, MST-5/6/7, DSH sync status. No production data, deployment or inventory quantities are changed by preparing this feature.

## Source and scope

The owner selected [LouisCourrian/riftbound-cards](https://github.com/LouisCourrian/riftbound-cards). Its dated GitHub releases provide `cards.json`; this importer does not run or copy its scraper. SHA-256 is checked against release metadata before parsing. A GitHub checksum proves snapshot integrity, not Riot authorization or official accuracy. The repository [license](https://github.com/LouisCourrian/riftbound-cards/blob/main/LICENSE) licenses its code under MIT and explicitly excludes card-data rights. Imported metadata remains marked `official_verified=false`.

All six sets found in release `v2026-10-08` have an explicit order: OGN, OGS, SFD, UNL, VEN, RAD. OGS is a printed supplemental set, **not** the complete Proving Grounds product checklist. Unknown future sets stop publication until their sequence and release state are reviewed; they never disappear silently. OGN remains before SFD. English release dates follow official announcements: [Origins](https://playriftbound.com/en-us/news/announcements/how-to-buy-riftbound/), [Spiritforged](https://playriftbound.com/en-us/news/announcements/spiritforged-precons-fiora-rumble/), [Unleashed](https://playriftbound.com/en-us/news/announcements/the-unleashed-overview/), [Vendetta](https://playriftbound.com/en-us/news/announcements/june-merch-store-updates/), [Radiance](https://playriftbound.com/en-us/news/announcements/the-radiance-overview/). Radiance releases October 23; revealed cards are included and labeled `Previewed · Unreleased` in collection, detail, library and deck lines. Null release dates are conservatively labeled previewed.

Filtering recognizes collector-number denominators, alphabetic alternate suffixes, `-star-`/`*` signatures, Showcase/Ultimate/Promo rarity, and alternate rune/token suffixes. No hardcoded set-size cutoff. Common/Uncommon standard printings use nonfoil; Rare/Epic use standard foil under the application's existing policy. Rune/token accessories retain a pending masterset target, even when the upstream primary type is Unit/Gear/Battlefield. Champion subtype labels become `Champion Unit`, preserving deck category routing. Costs/domains/printed text remain source values; community/manual errata are retained as unverified reference metadata and never installed as official effective text.

Canonical playable UUIDs and printing UUIDs are separate and stable. The source does not establish cross-set playable equivalence. Default identities are scoped to the edition, visibly recorded as `edition-unresolved`; `canonical` permits explicit reviewed mapping before the first publication. Names never merge cards. Changing an imported canonical mapping or treatment fails and requires explicit reconciliation. Existing catalogs from a different importer require explicit adoption; this importer refuses to manufacture duplicate identities alongside them.

## Preview and publish

Install dependencies and apply all Supabase migrations, including `202610080004_catalog_ingestion.sql`.

```sh
npm ci
npm run catalog:import -- --report /tmp/catalog-review-report.json
# Pin the next command to the version inspected in the report:
npm run catalog:import -- --version v2026-10-08 --report /tmp/catalog-review-report.json
```

Preview has no database connection, ownership changes or artwork downloads. It fetches release metadata and JSON with exact host allowlists, manual validated redirects, timeouts, content-type checks and an 8 MB limit. Hosts: `api.github.com`, `github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`. For Node 24 in a proxy environment, enable its supported environment-proxy setting (`NODE_USE_ENV_PROXY=1`) and preserve CA trust. No API secret is required for a public release.

For disconnected review, download the release asset separately, then supply the release SHA-256:

```sh
npm run catalog:import -- --file /path/to/cards.json --version v2026-10-08 \
  --sha256 91482269f100d570f5fa3a20a6cd611c401db4925ead47d2cc0f07217c4ed229 \
  --report /tmp/catalog-review-report.json
```

Keep pinned source artifacts and reports outside Git in private operational storage. Never commit card images or credentials. Configure `CATALOG_DATABASE_URL` only in the trusted administrative CLI environment; remote connections require `sslmode=verify-full`. Do not add it to the Next.js/Vercel public or application environment. The CLI uses an administrative PostgreSQL role, not a browser endpoint. The role needs writes on catalog tables, import keys and sync runs, plus locks/reads on the personal tables. Ordinary authenticated/anonymous users have read access only to catalog/status data; private import keys are inaccessible.

```sh
# Publish only after reviewing config/catalog-review.json and the preview report:
npm run catalog:import -- --version v2026-10-08 --publish
# Explicitly publish the resolved subset while exposing unresolved counts:
npm run catalog:import -- --version v2026-10-08 --publish --partial
```

Without `--partial`, any unresolved edition blocks publication. Partial import is never advertised as a complete Proving Grounds checklist. No schedule is installed; configure a job separately once source and authorization review are complete. A killed job may remain `running`; check worker health before starting another. Detailed raw errors are not logged because drivers/redirect URLs can include secrets; public failures use `IMPORT_FAILED`.

Publication locks catalog and personal mutation tables in a fixed order, then upserts the complete resolved batch in one transaction. Existing database inventory/wishlist eligibility checks run before commit. No import changes owned quantities, reservations, decks or wishlist entries. Missing source records are retained and counted rather than deleted. Metadata, source checksums/review hashes and sync run results are persisted. Database failures roll back the catalog; the failed run remains visible. Back up before the first production import. Recovery is to retry a previously reviewed pinned snapshot, preserving stable IDs; treatment/identity changes and changed official product composition require explicit reconciliation rather than automatic rollback/remapping.

## Artwork authorization

Review update 2026-10-09: the owner confirmed that the app is **not registered** with Riot. No authorization has been obtained or submitted. A concrete [registration draft and remaining integration steps](RIOT-REGISTRATION.md) are prepared for the owner. Images remain disabled; neither that draft nor Riot's generic policy URL can be used as this application's approval reference.

The owner also proposed [Wysme/riftbound-cards on Hugging Face](https://huggingface.co/datasets/Wysme/riftbound-cards). Its dataset card describes a mirror of the same LouisCourrian pipeline, supplies artwork URLs rather than independent image rights, attributes card data to Riot, and leaves compliance to downstream users. Its custom `riot-legal-jibber-jabber` label is the uploader's declaration, not an app-specific license from Riot. It does not resolve the authorization dependency or the complete Proving Grounds checklist. The existing verified GitHub snapshot remains the import source; this mirror was reviewed as an alternative reference, not enabled as a new artwork provider. Do not assume the two snapshots are equal from a matching label or dataset-card count; pin a revision and verify the actual bytes before any future mirror import.

`images: null` is intentional. The [current Riot policy](https://developer.riotgames.com/policies/riftbound) restricts app assets to Riot API-provided content; the mirror's public URLs are not themselves evidence of approval for this application. Complete registration and obtain applicable authorization for this source, or switch artwork provenance to approved API content before enabling images. No authorization is claimed by this feature.

Once an administrator has checked the applicable rights, supply an HTTPS evidence reference and exact approved hosts in `images`:

```json
{"images":{"reference":"https://example.invalid/REPLACE_WITH_ACTUAL_AUTHORIZATION","hosts":["cmsassets.rgpub.io"]}}
```

This is a **shape example**, not authorization. URL checks do not grant rights. Host support is limited to Riot artwork hosts `cmsassets.rgpub.io` and `ddragon.leagueoflegends.com`; userinfo, non-HTTPS, custom ports and redirects elsewhere are rejected. The importer never guesses image URLs, modifies resize URLs or downloads an unreviewed host. Downloads use at most four workers, enforce size/time limits and inspect PNG/JPEG/WebP dimensions and SHA-256 before setting `ready`. Unsupported formats or failed downloads retain a placeholder. Supabase stores provenance/URL/dimensions/checksum/status, never base64 image bytes. A future image storage mirror requires separate authorized Storage configuration. Complete the Riot-required attribution and verified format rules before public launch; existing deck legality remains `Unverified`.

## Proving Grounds review

Review update 2026-10-09: Riot's [preview-season announcement](https://playriftbound.com/en-us/news/announcements/what-to-expect-during-preview-season/) explicitly identifies original OGS cards as nonfoil. This establishes their treatment independently of rarity. It does **not** enumerate the complete box contents. The [Proving Grounds review](PROVING-GROUNDS-REVIEW.md) lists the 24 mirror records awaiting a complete official checklist. They remain unresolved in publication; no verified product membership, inventory or box quantity has been fabricated.

`provingGrounds: null` exposes 24 unresolved OGS records in the current snapshot instead of inferring foil from rarity. Provide a **complete** reviewed official checklist, including OGN cards/runes/tokens actually in the box, quantities if published, and actual treatments. The configuration accepts:

```json
{"provingGrounds":{"sourceUrl":"https://playriftbound.com/en-us/REPLACE_WITH_OFFICIAL_COMPLETE_SOURCE","version":"REVIEWED_VERSION","checksum":"SHA256_OF_OFFICIAL_SOURCE_BYTES","complete":true,"contents":[{"cardCode":"SOURCE_CARD_CODE","quantity":null,"treatment":"nonfoil"}]}}
```

The template is not a checklist. Publication downloads the official source and checks its checksum; every listed printing must exist in the snapshot. Missing members/duplicate rows reject the entire plan. Only this reviewed product evidence is marked official. Product membership uses the same printing UUIDs; it does not duplicate goals or replace masterset targets with box quantities. The database's existing product exception continues to take precedence. `printings` can document nonstandard-number/treatment decisions with a reference; it cannot make an excluded foil eligible without the verified product exception.

## Verification

The real `v2026-10-08` JSON was downloaded and checked against GitHub's published digest. It contains 1,366 records. Current review: 1,058 resolved base editions (OGN 298, SFD 222, UNL 227, VEN 173, RAD 138), 284 excluded variants and 24 unresolved OGS records. These are snapshot counts, not permanent set-size constraints or a claim that Radiance is fully revealed.

Unit tests cover filters, treatments, stable identities, previews, accessories, Champions, malformed payloads, Proving Grounds precedence, download redirects/types/limits and image metadata. Disposable PostgreSQL tests cover idempotent publication, RLS, ownership preservation, rollback, concurrent personal writes, missing-card retention and fixture isolation. The local Auth/PostgREST browser harness uses unmistakable TEST ONLY data for partial status, preview labels, placeholders and desktop/mobile layout. Live authorization, hosted Supabase and a complete official Proving Grounds composition remain external dependencies.

Executed in this environment: typecheck, ESLint and production build passed; 28 unit checks and 23 PostgreSQL checks passed, including the pinned real snapshot; 6 fixture browser flows and 2 real-catalog desktop/mobile flows passed. Two unconfigured-state browser tests were intentionally skipped by the configured local harness. Initial browser failures exposed a missing preview field in the pre-existing SQL view snapshot and cross-panel keyboard scrolling; these were fixed. Test selectors, animation waits and the touch activation/movement sequence were corrected without weakening quantity/allocation assertions.

To repeat the real-data browser preview **only in disposable local services**:

```sh
P0_CATALOG_FILE=/path/to/cards.json \
P0_CATALOG_VERSION=v2026-10-08 \
P0_CATALOG_SHA256=91482269f100d570f5fa3a20a6cd611c401db4925ead47d2cc0f07217c4ed229 \
P0_UI_GREP='real community catalog preview' npm run test:local
```

This mode uses actual metadata with placeholders, no authorization claim and no collection ownership seed. It generates desktop/mobile screenshots in `test-results`. The normal `test:local` harness still uses synthetic TEST ONLY fixtures. The public asset downloaded with curl matched GitHub's digest and both offline CLI preview and real publication were verified. Native Node `fetch` to public GitHub failed in this managed environment (`Request was cancelled`); the automatic release-fetch path is unit-tested but could not be verified live here. Use the documented pinned-file mode until administrative runner egress is configured. No production Supabase migration, publication, scheduled job, merge or deployment was performed.
