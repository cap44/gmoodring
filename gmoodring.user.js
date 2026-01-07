// ==UserScript==
// @name         Grok Rate Limit Monitor
// @namespace    http://tampermonkey.net/
// @version      4.4
// @description  Tiny widget to monitor your Grok free tier usage
// @author GitHub/cap44
// @coauthor Microsoft Copilot (AI assistance)
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    let gmoodringVer = 4.4;
    console.log(`gmoodring v${gmoodringVer} loaded`);
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
    // --- State ---
    let remainingTokens = 0;
    let totalTokens = 0;
    let windowHours = 0;
    let state = "pending"; // "ready" | "exhausted" | "pending"

    // Absolute reset times
    let lowResetTime = 0;
    let highResetTime = 0;

    // --- Create floating widget ---
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

    // --- Draggable ---
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
            box.style.right = "auto"; box.style.bottom = "auto";
        }
    });
    document.addEventListener("mouseup", () => { dragging = false; });

    // --- UI nudge ---
    function nudgeGrokUI() {
        const input = document.querySelector("textarea");
        if (input) input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // --- Helpers ---
    function getFuelPercent() {
        if (totalTokens === 0) return 0;
        const pct = remainingTokens / totalTokens;
        return Math.round(Math.pow(pct, 0.65) * 100);
    }

    function pickColor(pct) {
        if (remainingTokens === 0) return "purple";
        if (pct >= 70) return "limegreen";
        if (pct >= 40) return "gold";
        if (pct >= 10) return "orange";
        return "red";
    }

    function formatTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h}h ${m}m ${s}s`;
    }

    function formatClock(ms) {
        const d = new Date(ms);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // --- Rendering ---
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

        const now = Date.now();
        const lowRemaining = Math.max(0, Math.floor((lowResetTime - now) / 1000));
        const highRemaining = Math.max(0, Math.floor((highResetTime - now) / 1000));

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
        } else if (state === "pending") {
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

    // --- Inject marquee animation once ---
    const style = document.createElement("style");
    style.textContent = `
        @keyframes grokMarquee {
            0%   { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }
    `;
    document.head.appendChild(style);

    // --- Fetch limits ---
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
                    totalTokens = json.totalTokens;
                    windowHours = json.windowSizeSeconds / 3600;

                    const waitLowSecs = json.lowEffortRateLimits.waitTimeSeconds;
                    const waitHighSecs = json.highEffortRateLimits.waitTimeSeconds;

                    lowResetTime = waitLowSecs > 0 ? Date.now() + waitLowSecs * 1000 : 0;
                    highResetTime = waitHighSecs > 0 ? Date.now() + waitHighSecs * 1000 : 0;

                    if (remainingTokens > 0) {
                        state = "ready";
                        if (waitLowSecs === 0) nudgeGrokUI();
                    } else if (waitLowSecs > 0 || waitHighSecs > 0) {
                        state = "exhausted";
                    } else {
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

    // --- Update loop ---
    setInterval(() => {
        renderBox();
        if (state === "exhausted" &&
            lowResetTime === 0 &&
            highResetTime === 0) {
            fetchLimits();
        }
    }, 1000);

    // --- 30-minute backend resync ---
    setInterval(fetchLimits, 30 * 60 * 1000);

    document.addEventListener("keydown", e => {
        if (e.key === "Enter") setTimeout(fetchLimits, 2000);
    });

    fetchLimits();
    // poll server every 30 minutes to resync wait times
setInterval(fetchLimits, 30 * 60 * 1000);
})();