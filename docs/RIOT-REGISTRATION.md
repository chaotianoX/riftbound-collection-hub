# Riot registration preparation

Prepared 2026-10-09. **Draft only; not submitted or approved.** The owner confirmed that Riftbound Collection Hub is not registered with Riot. `config/catalog-review.json` therefore retains `images: null`; the app uses placeholders. This document is not a license or an artwork authorization reference.

## Official requirements checked

[Riftbound documentation](https://developer.riotgames.com/docs/riftbound) requires a written license or an app-specific API key. [Riftbound policy](https://developer.riotgames.com/policies/riftbound) requires product registration and restricts assets to API-provided materials. Public availability of a card image, hosting on a Riot CDN, and the community repository's MIT code license do not establish permission for this app. Registering alone does not authorize the mirror's artwork.

The [portal guide](https://developer.riotgames.com/docs/portal) describes project registration and production-key applications. The owner must sign in to their own Riot account and supply contact details, an accessible prototype URL, and accurate distribution information. No Riot account connection is available in this workspace. No application, support request, acceptance of terms, or message to Riot has been sent.

## Application draft — English

**Product name:** Riftbound Collection Hub

**Platform:** Responsive web application for desktop, tablet and mobile browsers.

**Description:** Riftbound Collection Hub helps players manage their physical card collections, track collection goals, maintain acquisition wishlists, and construct saved decks. Players sign in to their own account. Theorycraft decks allow cards the player does not own; Physical decks explicitly allocate copies from the player's inventory. Transactional reservations prevent the same copies from being allocated twice. Card ownership, printing selection, and playable card identity are kept separate.

**User flow:** Sign in; browse and filter the catalog; record owned quantities; inspect missing cards and availability; create a Theorycraft deck; add cards by drag-and-drop, touch controls or keyboard; optionally change to Physical mode and explicitly allocate owned printings. Deck management includes duplication, renaming, deletion and text import/export. Shortages and allocation failures remain visible.

**Current prototype limitations:** The catalog importer uses owner-selected community metadata from LouisCourrian/riftbound-cards, marked unverified. Artwork remains disabled pending authorization and approved API provenance. Revealed, unreleased cards are labeled as such. Official format profiles and official errata ingestion are not implemented; deck legality is displayed as Unverified. Rules Assistant is planned. Full Proving Grounds product composition still requires official evidence. The prototype does not yet meet all public-launch requirements.

**Requested access:** Authorized English card metadata and artwork, set/printing identifiers, official deckbuilding rules and versioned errata suitable for catalog browsing and deck management. Please identify the approved API resources and permitted delivery/storage methods. Please clarify whether any use of the selected community metadata mirror is permitted; we do not assume that API approval permits arbitrary external artwork.

**Distribution:** Owner to supply the actual private preview URL and intended public domain. GitHub source: https://github.com/chaotianoX/riftbound-collection-hub (private; not a substitute for a testable app URL).

**Owner/contact:** To be completed in the Developer Portal by the owner. Do not place private contact details, credentials or API keys in this repository.

**Monetization:** No payment, advertising or marketplace integration is implemented. Owner to confirm intended monetization in the application.

## Prototype evidence

The 2026-10-08 local review generated desktop and mobile screenshots with actual community metadata and placeholders. Those screenshots demonstrate UI behavior, not authorized artwork or a publicly accessible service. Supply a working preview with test access acceptable to Riot; do not share a personal account's inventory or passwords. Do not deploy solely to obtain a URL without separate deployment authorization.

## After submission and approval

1. Record the project/application reference and actual approval or written-license reference, date and scope in private operational records. Keep secret API keys only in the administrative runner's secret store.
2. Implement the API resources actually documented and enabled for this project. Do not invent a Riftbound endpoint or treat the existing mirror URLs as API-delivered assets.
3. Review each image's approved provenance, hosts and permitted use. Enable `images` only with applicable evidence; URL validation alone cannot establish rights. The current importer's metadata is prepared for reviewed URLs but does not implement a Riot API connection.
4. Implement and verify the official format profiles required for public deckbuilding before launch. Keep Unverified until that work is complete.
5. Add the exact attribution required by the [Riftbound policy's Brand Integrity section](https://developer.riotgames.com/policies/riftbound), substituting Riftbound Collection Hub for the project-title placeholder, in an easy-to-find UI location when applicable. Do not present attribution as evidence of current approval.
6. Recheck current policies and the [site verification instructions](https://developer.riotgames.com/how-to-verify-site.html). If Riot requests `riot.txt`, use the exact project-specific verification value; never fabricate one or commit an API key in its place.

Registration, approval, API integration, asset permission and deployment are separate steps. None is claimed complete by preparing this draft.
