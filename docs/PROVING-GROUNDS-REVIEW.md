# Proving Grounds evidence review

Reviewed 2026-10-09. **Incomplete product review; not a publishable checklist.** This file records facts checked during the requested catalog stage. `config/catalog-review.json` retains `provingGrounds: null` and the importer still reports these 24 OGS editions as unresolved. They have not been added to the application's eligible collection or assigned inventory.

## What the official sources establish

Riot's [What to Expect During Preview Season](https://playriftbound.com/en-us/news/announcements/what-to-expect-during-preview-season/) identifies OGS as the supplemental cards originally exclusive to Proving Grounds and establishes that these original OGS editions are nonfoil. This applies even to Rare/Epic; rarity cannot be used to turn them into foil. Riot's later [Spiritforged preview announcement](https://playriftbound.com/en-us/news/announcements/spiritforged-preview-season/) discusses foil promo reprints, which are distinct from the original box editions and do not replace them in this application's checklist.

The [official product listing](https://merch.riotgames.com/en-us/product/riftbound-proving-grounds/) confirms four decks featuring Annie, Garen, Lux and Master Yi but does not enumerate every printing or its quantity. The official quick-start PDF linked by [How to Play: Get Started Now](https://playriftbound.com/en-us/news/rules-and-releases/how-to-play-get-started/) describes gameplay and deck components; it is not a complete product checklist. Neither source justifies marking a 24-record OGS list as the complete box.

Official pages were inspected using web retrieval. Direct HTTPS download of the official article was blocked by this execution environment's destination policy. No checksum of original official source bytes was obtained; no extracted text hash is represented as such a checksum. The publication step still requires an independently reviewed official source and its actual downloaded checksum.

## OGS records staged for review

These identifiers and names are factual metadata from the pinned community release [v2026-10-08](https://github.com/LouisCourrian/riftbound-cards/releases/tag/v2026-10-08), not an official composition certificate. Its JSON checksum is `91482269f100d570f5fa3a20a6cd611c401db4925ead47d2cc0f07217c4ed229`. Names retain the mirror's labels without inventing canonical equivalence. Each has original-box treatment **nonfoil** under the official set-level statement above; published box quantities remain unknown.

| Source card code | Mirror display name | Rarity | Original OGS treatment | Box quantity |
| --- | --- | --- | --- | --- |
| ogs-001-024 | Annie, Fiery | Epic | nonfoil | Unknown |
| ogs-002-024 | Firestorm | Uncommon | nonfoil | Unknown |
| ogs-003-024 | Incinerate | Common | nonfoil | Unknown |
| ogs-004-024 | Master Yi, Meditative | Rare | nonfoil | Unknown |
| ogs-005-024 | Zephyr Sage | Uncommon | nonfoil | Unknown |
| ogs-006-024 | Lux, Illuminated | Rare | nonfoil | Unknown |
| ogs-007-024 | Garen, Rugged | Rare | nonfoil | Unknown |
| ogs-008-024 | Gentlemen's Duel | Common | nonfoil | Unknown |
| ogs-009-024 | Master Yi, Honed | Epic | nonfoil | Unknown |
| ogs-010-024 | Annie, Stubborn | Rare | nonfoil | Unknown |
| ogs-011-024 | Flash | Common | nonfoil | Unknown |
| ogs-012-024 | Blast of Power | Common | nonfoil | Unknown |
| ogs-013-024 | Garen, Commander | Epic | nonfoil | Unknown |
| ogs-014-024 | Lux, Crownguard | Epic | nonfoil | Unknown |
| ogs-015-024 | Recruit the Vanguard | Uncommon | nonfoil | Unknown |
| ogs-016-024 | Vanguard Attendant | Common | nonfoil | Unknown |
| ogs-017-024 | Dark Child, Starter | Rare | nonfoil | Unknown |
| ogs-018-024 | Tibbers, Annie | Epic | nonfoil | Unknown |
| ogs-019-024 | Wuju Bladesman, Starter | Rare | nonfoil | Unknown |
| ogs-020-024 | Highlander, Yi | Epic | nonfoil | Unknown |
| ogs-021-024 | Lady of Luminosity, Starter | Rare | nonfoil | Unknown |
| ogs-022-024 | Final Spark, Lux | Epic | nonfoil | Unknown |
| ogs-023-024 | Might of Demacia, Starter | Rare | nonfoil | Unknown |
| ogs-024-024 | Decisive Strike, Garen | Epic | nonfoil | Unknown |

## Remaining evidence needed for publication

Obtain an official, complete first-edition product checklist identifying all cards from every included deck, including OGN printings, runes, tokens and any distinct battlefield editions supplied in the product. Record actual treatment and printed identity separately from membership. Record quantities when published; otherwise retain null. A physical count, community decklist or collector-number denominator alone does not establish completeness or printing equivalence.

Compare every checklist member to the chosen snapshot before configuring `provingGrounds`. If a distinct edition is missing, extend the reviewed catalog with explicit identity and provenance rather than substituting a similarly named printing. The importer rejects missing members and ambiguous treatment changes. Product quantities never become owned inventory or masterset targets.

Do not set `complete: true`, `checklist_verified: true`, `official_verified: true` for community metadata, or fabricate an official-source checksum to unblock publication. The existing database product exception remains unchanged. The owner's instruction to push the review branch with pending dependencies does not certify the incomplete checklist.
