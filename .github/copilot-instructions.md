**Repository Overview**

This repository is a single-purpose userscript: `gmoodring.user.js` — a lightweight TamperMonkey/ViolentMonkey userscript that displays Grok.com rate-limit status in a floating widget. There is no build system, no tests, and no backend code in this repo; changes affect the single userscript file and its metadata header.

**Big Picture**

- **Single file app**: All logic, UI, and network I/O live in `gmoodring.user.js`.
- **Network integration**: The script POSTs to `https://grok.com/rest/rate-limits` via `GM_xmlhttpRequest` (see `fetchLimits()`), and relies on response fields: `remainingTokens`, `totalTokens`, `windowSizeSeconds`, and `lowEffortRateLimits.waitTimeSeconds` / `highEffortRateLimits.waitTimeSeconds`.
- **UI surface**: A floating DOM node is appended to `document.body` and updated by `renderBox()` / `updateFuelBar()`; the script relies on `setInterval` ticks and user events to trigger refreshes.

**How to be productive quickly**

- Open and edit `gmoodring.user.js` directly — no build step required.
- To test changes: open the raw file URL (see README) or load the local file into TamperMonkey/ViolentMonkey and reload a Grok chat page (`https://grok.com/c/*`).
- When editing network logic, inspect the `fetchLimits()` function and the parsing of `response.responseText` for expected fields.

**Project‑specific conventions and patterns**

- Preserve the userscript metadata block at the top (`// ==UserScript== … // ==/UserScript==`). Update `@version` for every user-facing change so userscript managers prompt updates.
- Use `GM_*` APIs (the script already uses `GM_xmlhttpRequest`, `GM.getValue`, `GM.setValue`) rather than browser-native XHR/fetch so the userscript manager handles CORS and security.
- UI updates are centralized in `renderBox()`; modify markup and styles there. Keep the `fuelbar` element id intact if you reuse `updateFuelBar()`.
- Prefer conservative polling: the script uses a 1s tick for countdowns and polls `fetchLimits()` conditionally (every 10s at zero and a 30‑minute periodic sync). Follow that pattern to avoid unexpected throttling.

**Important implementation notes / gotchas**

- GreaseMonkey is unsupported due to missing `GM_xmlhttpRequest`; the script warns users on install (see top lines). Tests or automation that assume standard fetch/XHR will fail.
- The endpoint returns separate `lowEffortRateLimits` and `highEffortRateLimits` wait times — the script takes the max when tokens are zero. When changing exhaustion logic, honor both fields.
- Keep `run-at document-end` in the metadata unless you intentionally need earlier DOM access.

**Examples (where to look in code)**

- Network and parsing: `fetchLimits()` — looks for `json.remainingTokens`, `json.totalTokens`, `json.windowSizeSeconds`, `json.lowEffortRateLimits.waitTimeSeconds`.
- UI rendering: `renderBox()` and `updateFuelBar()` — modify these for UI tweaks.
- Drag behavior: mouse handlers attached to the created `div` near the top of the script.

**Developer workflow / commit guidance**

- Edit `gmoodring.user.js` → bump `@version` in the metadata header → open raw file in browser / load in TamperMonkey to verify behavior on `https://grok.com/c/*`.
- Commit messages: short imperative summary, e.g. `Bump version 3.2 → 3.3: adjust countdown logic`.

**When to ask for review / what to test manually**

- Any change to network parsing or exhaustion handling should be manually verified on a Grok chat page and checked for correct countdowns, token math, and UI nudges.
- Visual/UI changes: verify dragging, positioning, and z-index do not conflict with site UI.

If anything here is unclear or you'd like this shortened/expanded (for example: automated local testing tips, CI hooks, or a release checklist), tell me which section to adjust and I will iterate.
