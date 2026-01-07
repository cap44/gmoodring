# 📘 **DEVELOPER_GUIDE.md**  
### *Grok’s Mood Ring — Internal Architecture & Code Walkthrough (v4.4)*

---

# 🧭 Overview

**Grok’s Mood Ring** is a compact userscript that displays a floating widget on Grok chat pages.  
It monitors the free‑tier rate limits and shows:

- Remaining tokens  
- Low‑effort and high‑effort wait timers  
- Live countdowns (accurate to the second)  
- Exact timestamps when each bucket resets  
- Automatic backend resync every 30 minutes  
- A “pending” state when Grok hasn’t returned usable data yet  

The script is intentionally small, dependency‑free, and works on TamperMonkey, ViolentMonkey, and FireMonkey.

---

# 🧠 Architecture Summary

The script is built around **three core systems**:

## 1. **State Machine**
The widget operates in one of three states:

| State       | Meaning |
|-------------|---------|
| `pending`   | Grok hasn’t returned valid wait times yet |
| `ready`     | User has remaining tokens |
| `exhausted` | No tokens left; timers running |

This prevents UI glitches and keeps transitions predictable.

---

## 2. **Absolute Reset Timestamps**
When Grok returns:

```
waitTimeSeconds: 12345
```

…the script converts it into:

```
resetTime = Date.now() + waitTimeSeconds * 1000
```

This enables:

- Smooth countdowns  
- No drift  
- No dependence on polling frequency  

The UI recalculates remaining time every second.

---

## 3. **Backend Resync**
To stay aligned with Grok’s backend (which may adjust windows mid‑period), the script polls:

- On load  
- After pressing Enter  
- When timers hit zero  
- Every 30 minutes  

This ensures accuracy over long sessions.

---

# 🧩 Code Walkthrough (Section by Section)

Below is a detailed explanation of the script’s structure and purpose.

---

## 1. **Metadata Block**
```js
// ==UserScript==
// @name         Grok Rate Limit Monitor
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  Tiny widget to monitor your Grok free tier usage
// @author ...
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==
```

This tells the userscript manager:

- What the script is called  
- Where it runs  
- What permissions it needs  
- When it should execute  

---

## 2. **Version Tag + Startup Log**
```js
let gmoodringVer = 4.4;
console.log(`gmoodring v${gmoodringVer} loaded`);
```

This is the script’s internal version number.  
It appears in:

- The widget header  
- Console logs  
- The unsupported‑manager warning  

---

## 3. **Unsupported Manager Warning**
```js
(async () => {
    const warned = await GM.getValue("unsupportedManagerWarned", false);

    if (typeof GM_xmlhttpRequest !== "function" && !warned) {
        alert(
            "gmoodring ${gmoodringVer}: Hey! This is the 'Grok's Mood Ring' script.\n\n" +
            ...
        );

        await GM.setValue("unsupportedManagerWarned", true);
    }
})();
```

Purpose:

- Detect if the userscript manager supports `GM_xmlhttpRequest`
- Warn the user once (stored via GM storage)
- Avoid confusing silent failures on GreaseMonkey

---

## 4. **State Variables**
```js
let remainingTokens = 0;
let totalTokens = 0;
let windowHours = 0;
let state = "pending";

let lowResetTime = 0;
let highResetTime = 0;
```

These hold the current rate‑limit snapshot and countdown anchors.

---

## 5. **Floating Widget Creation**
```js
const box = document.createElement("div");
box.style.cssText = ` ... `;
box.textContent = "Loading Grok limits…";
document.body.appendChild(box);
```

Creates the floating UI element.

---

## 6. **Draggable Logic**
```js
let dragging = false, offsetX = 0, offsetY = 0;
box.addEventListener("mousedown", ...);
document.addEventListener("mousemove", ...);
document.addEventListener("mouseup", ...);
```

Allows the widget to be dragged anywhere on the screen.

---

## 7. **UI Nudge**
```js
function nudgeGrokUI() {
    const input = document.querySelector("textarea");
    if (input) input.dispatchEvent(new Event("input", { bubbles: true }));
}
```

This forces Grok’s UI to refresh when tokens become available.

---

## 8. **Helper Functions**
### Fuel Bar Percentage
```js
function getFuelPercent() { ... }
```

Uses a nonlinear curve to exaggerate low fuel.

### Color Picker
```js
function pickColor(pct) { ... }
```

Maps fuel percentage to a color.

### Time Formatting
```js
function formatTime(secs) { ... }
function formatClock(ms) { ... }
```

Converts seconds → `1h 23m 45s`  
Converts timestamp → `19:42`

---

## 9. **Rendering Function**
```js
function renderBox() { ... }
```

This rebuilds the widget’s HTML every second.

It displays:

- Version  
- Fuel bar  
- Token counts  
- Low‑effort timer + reset timestamp  
- High‑effort timer + reset timestamp  
- Window size  
- Pending marquee  

This is the heart of the UI.

---

## 10. **Marquee Animation**
```js
const style = document.createElement("style");
style.textContent = `@keyframes grokMarquee { ... }`;
document.head.appendChild(style);
```

Adds a CSS animation for the “Calculating…” text.

---

## 11. **Rate‑Limit Fetcher**
```js
function fetchLimits() {
    GM_xmlhttpRequest({
        method: "POST",
        url: "https://grok.com/rest/rate-limits",
        ...
    });
}
```

This calls Grok’s backend and updates:

- remainingTokens  
- totalTokens  
- windowHours  
- lowResetTime  
- highResetTime  
- state  

This is the authoritative data source.

---

## 12. **Update Loop**
```js
setInterval(() => {
    renderBox();
    if (state === "exhausted" && lowResetTime === 0 && highResetTime === 0) {
        fetchLimits();
    }
}, 1000);
```

Runs every second:

- Re-renders the widget  
- Checks if timers hit zero  
- If so, fetches fresh limits  

---

## 13. **Backend Resync**
```js
setInterval(fetchLimits, 30 * 60 * 1000);
```

Ensures long‑running sessions stay accurate.

---

## 14. **Enter Key Hook**
```js
document.addEventListener("keydown", e => {
    if (e.key === "Enter") setTimeout(fetchLimits, 2000);
});
```

After sending a message, Grok consumes a token.  
This refreshes the widget shortly afterward.

---

## 15. **Initial Fetch**
```js
fetchLimits();
```

Starts everything.

---
if you want to see the full documentation, look to [gmoodring.user.md] in this project