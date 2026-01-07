// ==UserScript==
// @name         Grok Rate Limit Monitor
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  Tiny widget to monitor your Grok free tier usage
// @author       GitHub/cap44
// @coauthor     Microsoft Copilot (AI assistance)
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // INTERNAL VERSION TAG
    // This is the script’s own version number (separate from @version).
    // Used for UI display, console logs, and warnings.
    // -------------------------------------------------------------------------
    let gmoodringVer = 4.4;
    console.log(`gmoodring v${gmoodringVer} loaded`);

    // -------------------------------------------------------------------------
    // UNSUPPORTED MANAGER WARNING
    // Some userscript managers (notably GreaseMonkey) do NOT support
    // GM_xmlhttpRequest. This block warns the user ONCE and never again.
    // -------------------------------------------------------------------------
    (async () => {
        const warned = await GM.getValue("unsupportedManagerWarned", false);

        if (typeof GM_xmlhttpRequest !== "function" && !warned) {
            alert(
                "gmoodring ${gmoodringVer}: Hey! This is the 'Grok's Mood Ring' script.\n\n" +
                "Your userscript manager doesn't support the GM_xmlhttpRequest function this script relies on.\n\n" +
                "Please switch to TamperMonkey, ViolentMonkey, and/or FireMonkey.\n" +
                "Unfortunately, GreaseMonkey isn't supported. Thanks, and have a great day!"
            );

            await GM.setValue("unsupportedManagerWarned", true);
        }
    })();

    // -------------------------------------------------------------------------
    // STATE VARIABLES
    // These hold the current rate-limit snapshot and UI state.
    // -------------------------------------------------------------------------
    let remainingTokens = 0;   // How many tokens you have left
    let totalTokens = 0;       // Max tokens in your free-tier window
    let windowHours = 0;       // Rate-limit window size (hours)
    let state = "pending";     // "pending" | "ready" | "exhausted"

    // Absolute timestamps when each bucket resets
    let lowResetTime = 0;
    let highResetTime = 0;

    // -------------------------------------------------------------------------
    // FLOATING WIDGET CREATION
    // This is the draggable UI box shown in the corner.
    // -------------------------------------------------------------------------
    const box = document.createElement("div");
    box.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; padding: 6px 10px;
        background: rgba(0,0,0,0.85); color: white; font-size: 11px;
        border-radius: 8px; z-index: 999999; font-family: Arial, sans-serif;
        cursor: move; white-space: pre-line; line-height: 1.1;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid #444;
    `;
    box.textContent = "Loading Grok limits…";
    document.body.appendChild(box);

    // -------------------------------------------------------------------------
    // DRAGGABLE LOGIC
    // Allows the widget to be moved anywhere on the screen.
    // -------------------------------------------------------------------------
    let dragging = false, offsetX = 0, offsetY = 0;

    box.addEventListener("mousedown", e => {
        dragging = true;
        offsetX = e.clientX - box.offsetLeft;
        offsetY = e.clientY - box.offsetTop;
    });

    document.addEventListener("mousemove", e => {
        if (dragging) {
            box.style.left = (e.clientX - offsetX) + "px";
            box.style.top = (e.clientY - offsetY) + "px";
            box.style.right = "auto"; 
            box.style.bottom = "auto";
        }
    });

    document.addEventListener("mouseup", () => { dragging = false; });

    // -------------------------------------------------------------------------
    // UI NUDGE
    // Forces Grok’s UI to refresh when tokens become available.
    // -------------------------------------------------------------------------
    function nudgeGrokUI() {
        const input = document.querySelector("textarea");
        if (input) input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // -------------------------------------------------------------------------
    // HELPER FUNCTIONS
    // Fuel bar math, color selection, time formatting.
    // -------------------------------------------------------------------------

    // Nonlinear fuel bar percentage (makes low fuel more dramatic)
    function getFuelPercent() {
        if (totalTokens === 0) return 0;
        const pct = remainingTokens / totalTokens;
        return Math.round(Math.pow(pct, 0.65) * 100);
    }

    // Color coding for the fuel bar
    function pickColor(pct) {
        if (remainingTokens === 0) return "purple";
        if (pct >= 70) return "limegreen";
        if (pct >= 40) return "gold";
        if (pct >= 10) return "orange";
        return "red";
    }

    // Format seconds → "1h 23m 45s"
    function formatTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h}h ${m}m ${s}s`;
    }

    // Format timestamp → "19:42"
    function formatClock(ms) {
        const d = new Date(ms);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // -------------------------------------------------------------------------
    // RENDERING FUNCTION
    // Rebuilds the widget’s HTML every second.
    // Shows:
    // - Version
    // - Fuel bar
    // - Token counts
    // - Low-effort timer + reset timestamp
    // - High-effort timer + reset timestamp
    // - Window size
    // - Pending marquee
    // -------------------------------------------------------------------------
    function renderBox() {
        const pct = getFuelPercent();
        const color = pickColor(pct);

        let content = `
            <div style="font-weight:bold; margin-bottom:4px; text-align:center; opacity:0.8;">
                Grok's Mood Ring ${gmoodringVer}
            </div>
            <div style="width:100%; height:5px; background:#333; border-radius:3px; margin-bottom:6px; overflow:hidden;">
                <div id="fuelbar" style="height:100%; width:${pct}%; background:${color}; transition: width 0.4s ease;"></div>
            </div>
            Tokens: ${remainingTokens}/${totalTokens}<br>
        `;

        // Compute live countdowns
        const now = Date.now();
        const lowRemaining  = Math.max(0, Math.floor((lowResetTime  - now) / 1000));
        const highRemaining = Math.max(0, Math.floor((highResetTime - now) / 1000));

        // Show timers depending on state
        if (state === "ready" || state === "exhausted") {
            content += `Low‑Effort: ${
                lowRemaining > 0
                    ? formatTime(lowRemaining) + " (at " + formatClock(lowResetTime) + ")"
                    : "Ready"
            }<br>`;

            content += `High‑Effort: ${
                highRemaining > 0
                    ? formatTime(highRemaining) + " (at " + formatClock(highResetTime) + ")"
                    : "Ready"
            }<br>`;
        } 
        else if (state === "pending") {
            content += `
                <div style="overflow:hidden; white-space:nowrap; font-size:11px; opacity:0.85;">
                    <span style="display:inline-block; animation:grokMarquee 2.2s linear infinite;">
                        Calculating wait times…
                    </span>
                </div>
            `;
        }

        content += `Window: ${windowHours}h`;
        box.innerHTML = content;
    }

    // -------------------------------------------------------------------------
    // MARQUEE ANIMATION
    // Injects CSS for the scrolling "Calculating…" text.
    // -------------------------------------------------------------------------
    const style = document.createElement("style");
    style.textContent = `
        @keyframes grokMarquee {
            0%   { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }
    `;
    document.head.appendChild(style);

    // -------------------------------------------------------------------------
    // RATE-LIMIT FETCHER
    // Calls Grok’s backend and updates:
    // - remainingTokens
    // - totalTokens
    // - windowHours
    // - lowResetTime
    // - highResetTime
    // - state machine
    // -------------------------------------------------------------------------
    function fetchLimits() {
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://grok.com/rest/rate-limits",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ requestKind: "DEFAULT", modelName: "grok-3" }),

            onload: function(response) {
                try {
                    const json = JSON.parse(response.responseText);

                    remainingTokens = json.remainingTokens;
                    totalTokens     = json.totalTokens;
                    windowHours     = json.windowSizeSeconds / 3600;

                    const waitLowSecs  = json.lowEffortRateLimits.waitTimeSeconds;
                    const waitHighSecs = json.highEffortRateLimits.waitTimeSeconds;

                    // Convert wait times → absolute timestamps
                    lowResetTime  = waitLowSecs  > 0 ? Date.now() + waitLowSecs  * 1000 : 0;
                    highResetTime = waitHighSecs > 0 ? Date.now() + waitHighSecs * 1000 : 0;

                    // Update state machine
                    if (remainingTokens > 0) {
                        state = "ready";
                        if (waitLowSecs === 0) nudgeGrokUI();
                    } 
                    else if (waitLowSecs > 0 || waitHighSecs > 0) {
                        state = "exhausted";
                    } 
                    else {
                        state = "pending";
                    }

                    renderBox();
                } catch (e) {
                    box.textContent = "Error parsing API";
                }
            },

            onerror: () => { box.textContent = "Network Error"; }
        });
    }

    // -------------------------------------------------------------------------
    // UPDATE LOOP (EVERY SECOND)
    // - Re-renders the widget
    // - If both timers hit zero, fetch fresh limits
    // -------------------------------------------------------------------------
    setInterval(() => {
        renderBox();

        if (state === "exhausted" &&
            lowResetTime === 0 &&
            highResetTime === 0) {
            fetchLimits();
        }
    }, 1000);

    // -------------------------------------------------------------------------
    // BACKEND RESYNC (EVERY 30 MINUTES)
    // Ensures long-running sessions stay accurate.
    // -------------------------------------------------------------------------
    setInterval(fetchLimits, 30 * 60 * 1000);

    // -------------------------------------------------------------------------
    // ENTER KEY HOOK
    // After sending a message, Grok consumes a token.
    // This refreshes the widget shortly afterward.
    // -------------------------------------------------------------------------
    document.addEventListener("keydown", e => {
        if (e.key === "Enter") setTimeout(fetchLimits, 2000);
    });

    // -------------------------------------------------------------------------
    // INITIAL FETCH
    // Starts the whole system.
    // -------------------------------------------------------------------------
    fetchLimits();

})();