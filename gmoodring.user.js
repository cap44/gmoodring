// ==UserScript==
// @name         Grok Rate Limit Monitor (Mood Ring Edition)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Shows Grok.com rate-limit status with live countdown and smart auto-refresh
// @author cap44 
// @coauthor    Microsoft Copilot (AI assistance)
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- Create floating widget ---
    const box = document.createElement("div");
    box.style.position = "fixed";
    box.style.bottom = "20px";
    box.style.right = "20px";
    box.style.padding = "12px 16px";
    box.style.background = "rgba(0,0,0,0.75)";
    box.style.color = "white";
    box.style.fontSize = "13px";
    box.style.borderRadius = "10px";
    box.style.zIndex = "999999";
    box.style.fontFamily = "monospace";
    box.style.cursor = "move";
    box.style.whiteSpace = "pre-line";
    box.textContent = "Loading Grok limits…";
    document.body.appendChild(box);

    // --- Make widget draggable ---
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

    // --- State ---
    let remainingTokens = 0;
    let totalTokens = 0;
    let nextTokenSeconds = 0;
    let windowHours = 0;

    // --- Update widget text ---
    function renderBox() {
        if (isNaN(nextTokenSeconds)) {
            box.innerHTML =
                `<div style="font-weight:bold; margin-bottom:6px; text-align:center;">
                    Grok's Mood Ring 3.1
                 </div>` +
                `Tokens: ${remainingTokens}/${totalTokens}<br>` +
                `Next token: unknown<br>` +
                `Rolling window: ${windowHours}h`;
            return;
        }

        const h = Math.floor(nextTokenSeconds / 3600);
        const m = Math.floor((nextTokenSeconds % 3600) / 60);
        const s = nextTokenSeconds % 60;

        box.innerHTML =
            `<div style="font-weight:bold; margin-bottom:6px; text-align:center;">
                Grok's Mood Ring 3.1
             </div>` +
            `Tokens: ${remainingTokens}/${totalTokens}<br>` +
            `Next token: ${h}h ${m}m ${s}s<br>` +
            `Rolling window: ${windowHours}h`;
    }
function nudgeGrokUI() { const input = document.querySelector("textarea"); if (input) { input.dispatchEvent(new Event("input", { bubbles: true })); } }
    // --- Fetch rate limits (POST) ---
let lastRemaining = 0; // track previous token count

function fetchLimits() {
    GM_xmlhttpRequest({
        method: "POST",
        url: "https://grok.com/rest/rate-limits",
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
            requestKind: "DEFAULT",
            modelName: "grok-3"
        }),
        onload: function(response) {
            try {
                const json = JSON.parse(response.responseText);

                const newRemaining = json.remainingTokens;

                // Detect unexpected token increases (rolling window behavior)
                if (newRemaining > lastRemaining) {
                    nextTokenSeconds = json.lowEffortRateLimits.waitTimeSeconds;
                }
if (json.lowEffortRateLimits.waitTimeSeconds === 0 && newRemaining > 0) { nudgeGrokUI(); }
                lastRemaining = newRemaining;
                remainingTokens = newRemaining;
                totalTokens = json.totalTokens;
                windowHours = json.windowSizeSeconds / 3600;

                renderBox();
            } catch (e) {
                box.textContent = "Error parsing rate limits";
            }
        },
        onerror: function() {
            box.textContent = "Error fetching rate limits";
        }
    });
}


    // --- Local countdown tick + auto-refresh ---
setInterval(() => {
    if (nextTokenSeconds > 0) {
        nextTokenSeconds--;
        renderBox();
    } else {
        // Timer hit zero → poll less aggressively
        if (!window._lastZeroPoll || Date.now() - window._lastZeroPoll > 10000) {
            window._lastZeroPoll = Date.now();
            fetchLimits();
        }
    }
}, 1000);


    // --- Refresh after sending a message ---
    document.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            // Give Grok a moment to update its counters
            setTimeout(fetchLimits, 1500);
        }
    });

    // Initial fetch
    fetchLimits();

    // Safety net: periodic sync every 30 minutes
    setInterval(fetchLimits, 30 * 60 * 1000);

})();
