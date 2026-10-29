# Verification — 2026-10-28

## Public experimental release 0.0.1 — 2026-10-29

- Standalone Windows installer with copyright attribution to Ачкасова Олеся, GPLv3 license, explicit unsigned-panel permission and removal through Windows Apps.
- Installer payload validated without changing the local AE installation: version 0.0.1, 16 expected public files. No credential store, user projects, browser profiles or generation history are packaged.
- 18 automated checks passed, including independent CEP adapter compatibility, signed-manifest validation, tampering rejection, version comparison and installer checksum verification. Browser UI test passed with a synthetic provider.
- Download site deployed as an independent persistent user service on the author's server, port 47683. HTTP page, author notice, signed manifest and downloaded installer checksum verified from another machine. Private network addresses are not published.
- Update signing uses Ed25519. Only the public verification key ships in source and installer. Initial Windows installer has no Authenticode publisher certificate.
- The 0.0.1 minimal CEP adapter has automated and browser coverage; its new installer has not replaced the user's working private panel during this release preparation. Earlier native AE host tests below concern the private MVP build. No paid generation was submitted by the release checks.
- Public internet access to Anfa still requires the owner's router forwarding and external address. GitHub hosts source and a copy of the installer; it is not the update binary host.

## 0.1.1 panel reopening fix

- Reproduced menu selection opening no panel in AE 26.3.
- Renewed the panel registration (`studio.aiflow.ae.workspace`) within the same bundle and reduced its initial/minimum height for smaller displays.
- Reinstalled the manifest and fully restarted AE. The panel opened through Window > Extensions > After Ai and loaded the public model catalogue. It remained visible while Resizer created another project.
- No credential values were read or changed. Paid generation was not part of this check.

## Confirmed

- Core suite: 15 passing tests. Covers capability validation, payload construction, per-second and per-image pricing, cents-to-dollar conversion, audio pricing, unknown tariffs, size placement rules, cost deduplication, corrupt-ledger preservation and isolated DPAPI storage with synthetic input.
- Browser UI suite: passing. Native CEP file-picker interface is mocked; tests attach an image, take a layer, calculate the price, show the mismatch warning and complete a synthetic submit/poll/download/import cycle. Checks horizontal layout at widths 300, 380 and 600 pixels.
- Live public OpenRouter catalog: HTTP 200, 30 models returned through the real PowerShell worker without a key. 26 models expose generation durations. Current estimator handles the published per-second tariffs for 21 of those; token-priced models show an unknown estimate and allow a manual rate.
- Real After Effects 2026, version 26.3: separate synthetic project. Host checks passed for stable target IDs, source retrieval, matching-size replacement, preserved position/scale/keyframes/effect, duplicate-import prevention, mismatch insertion at Scale 100%, retained original layer and Project-bin folder placement.
- Real CEP panel in AE 2026: opens from Window > Extensions > After Ai, docks in the workspace, loads the live catalog and options, obtains the selected source with a preview, captures the current composition frame and displays a live price estimate (the observed default example was approximately $0.30).
- Composition PNG output verified at 640 × 360 pixels, matching its synthetic composition.
- Installed bundle for the current Windows user, with CEP 11/12 developer loading enabled after explicit user authorization. AE scripting file/network preference enabled from the authorized test setup.

## Limits

- No genuine API key was read, entered or inspected. No paid generation was submitted. Authenticated submit/poll/download behavior still requires the user's first run; the full cycle was tested using a synthetic service.
- AE 2024 compatibility is declared in the CEP manifest but has not been exercised on an AE 2024 installation.
- Full input-video uploads, rendered video fragments, automatic retiming, concurrent editing of one project's ledger from multiple AE instances, signed distribution and a macOS build are outside this MVP.
- Final small UI additions (persistent corner estimate and native file selection) passed the browser test; the already-open AE panel needs reopening in a restarted AE process to pick up the latest files.

Only synthetic fixtures and public model metadata were used. Synced sources were not modified.
