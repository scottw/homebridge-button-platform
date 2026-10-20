# homebridge-button-platform-22

Homebridge dynamic platform plugin: each configured button name becomes a
HomeKit StatelessProgrammableSwitch (plus a Battery service) triggered over HTTP.
Private fork of the archived `homebridge-button-platform` by Avi Miller; npm
name `homebridge-button-platform-22`, platform alias `button-platform`.

## Goal

Keep it small. No runtime dependencies (HTTP is `node:http`). Prefer deleting
code over adding it, but never break the compatibility contract below.

## Layout

- `src/index.ts`: registers the platform.
- `src/platform.ts`: accessory sync (cache restore, add, remove) and the HTTP server.
- `src/platformAccessory.ts`: HomeKit services, event-name map, battery state.
- `src/settings.ts`: plugin and platform names. Changing either orphans every user's cached accessories.
- `src/test/hbConfig/config.json`: config for `npm run dev`; Homebridge writes its runtime state next to it (gitignored).
- `local-development.md` (untracked): the pack, scp and `hb-service add` flow for the Homebridge Pi, and npm publishing.

## Compatibility contract

These are what users' devices, URLs and HomeKit automations depend on:

- Accessory UUID = `hap.uuid.generate(buttonName)`. Changing it breaks every automation.
- URI = `/button-` + name lowercased with every char outside `[a-z0-9]` replaced by `-`.
  Matching is case-insensitive and tolerates one trailing slash (mirrors the old express routing).
- Any HTTP method. `event` is read from query, then body (JSON or form-encoded), then
  an `event` header; the first valid value wins.
- Event names: `click`/`single-press`, `double-click`/`double-press`, `hold`/`long-press`.
  The `click`/`double-click`/`hold` names look Flic-specific but Stream Deck and Shelly
  setups use them too; they are not part of the Flic deprecation.
- Responses: 200 `OK`, 404 `Button not found.`, 422 JSON `{errors: [...]}` for bad
  event or battery header, 500 `Server error.` (including malformed JSON bodies).
- Config keys: `port` (default 3001), `buttons` (string array). Removed buttons are
  unregistered from the cache on startup.

## Flic deprecation (remove after 2026-12-31)

Flic 2 buttons on a Flic Hub LR have native HomeKit (https://flic.io/homekit), so the
Flic-only feature, battery reporting via the `button-battery-level` header, is
deprecated in 2.1.0 and logs a one-time warning. Flic hubs sending plain HTTP
requests keep working after removal; they are just another HTTP client.

Removal checklist (next major, 3.0.0):

- Drop the battery header handling and deprecation warning in `platform.ts`.
- Drop the Battery service in `platformAccessory.ts`, and call `removeService` on any
  cached Battery service so it disappears from HomeKit.
- Delete the Flic section and the deprecation note in `README.md` and `docs/flic-config.png`.
- Decide whether the 422 for an invalid battery header goes away (the header would be ignored).

## Commands

- `npm run lint` / `npm run build`
- `npm run dev`: builds, then runs a local Homebridge with this plugin on port 3001.
  Test with `curl 'http://localhost:3001/button-test-button?event=click'`.
- Node engines follow Homebridge 2 (22, 24, 26).

## Conventions

- No comments that narrate history or explain past decisions in code; put that here.
- Update `CHANGELOG.md` for user-visible changes.
