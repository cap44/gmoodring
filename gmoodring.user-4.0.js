// ==UserScript==
// @name         Grok Rate Limit Monitor (Mood Ring Edition) v4.0
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Shows Grok.com rate-limit status with live countdown and smart auto-refresh for free-tier users.
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- Config ---
    const USE_STRICT_MODE = true; 
    // true  = use max(waitLow, waitHigh) (safe, never lies)
    // false = use waitLow only (more permissive, shows tokens sooner)

    // --- State ---
    let remainingTokens = 0;
    let totalTokens = 0;
    let windowHours = 0;
    let targetResetTime = 0;
    let nextTokenSeconds = 0;
    let state = "pending"; // "ready" | "exhausted" | "pending"

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

    // --- Rendering ---
    function renderBox() {
        const pct = getFuelPercent();
        const color = pickColor(pct);

        const modeBadge = USE_STRICT_MODE 
            ? '<span style="color:#ccc; font-size:10px;">[Strict]</span>' 
            : '<span style="color:#ccc; font-size:10px;">[Low‑Effort]</span>';

        let content = `
            <div style="font-weight:bold; margin-bottom:4px; text-align:center; opacity:0.8;">
                Grok's Mood Ring 4.0 ${modeBadge}
            </div>
            <div style="width:100%; height:5px; background:#333; border-radius:3px; margin-bottom:6px; overflow:hidden;">
                <div id="fuelbar" style="height:100%; width:${pct}%; background:${color}; transition: width 0.4s ease;"></div>
            </div>
            Tokens: ${remainingTokens}/${totalTokens}<br>
        `;

        if (state === "ready") {
            content += `Next Token: ${nextTokenSeconds > 0 ? formatTime(nextTokenSeconds) : "Ready"}<br>`;
        } else if (state === "exhausted") {
            const diffSecs = Math.max(0, Math.floor((targetResetTime - Date.now()) / 1000));
            content += `Resets: ${formatTime(diffSecs)}<br>`;
        } else if (state === "pending") {
            content += `
                <div style="overflow:hidden; white-space:nowrap; font-size:11px; opacity:0.85;">
                    <span style="display:inline-block; animation:grokMarquee 2.2s linear infinite;">
                        Calculating wait time…
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

                    const waitLow = json.lowEffortRateLimits.waitTimeSeconds;
                    const waitHigh = json.highEffortRateLimits.waitTimeSeconds;
                    const wait = USE_STRICT_MODE ? Math.max(waitLow, waitHigh) : waitLow;

                    if (remainingTokens > 0) {
                        state = "ready";
                        nextTokenSeconds = waitLow;
                        targetResetTime = 0;
                        if (waitLow === 0) nudgeGrokUI();
                    } else if (wait > 0) {
                        state = "exhausted";
                        targetResetTime = Date.now() + wait * 1000;
                    } else {
                        state = "pending";
                        targetResetTime = 0;
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
        if (state === "exhausted" && targetResetTime > 0 && Date.now() >= targetResetTime) {
            targetResetTime = 0;
            fetchLimits();
        }
    }, 1000);

    document.addEventListener("keydown", e => {
        if (e.key === "Enter") setTimeout(fetchLimits, 2000);
    });

    fetchLimits();
})();