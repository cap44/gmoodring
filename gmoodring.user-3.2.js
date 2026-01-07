// ==UserScript==
// @name         Grok Rate Limit Monitor (Mood Ring Edition)
// @namespace    http://tampermonkey.net/
// @version      3.2
// @author cap44 (https://github.com/cap44/gmoodring)
// @coauthor Microsoft Copilot (AI assistance)
// @description  Shows Grok.com rate-limit status with live countdown and smart auto-refresh
// @match        https://grok.com/c/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    // Catch potential GreaseMonkey users and let them know that this script can't work with their userscript manager
    // Show the popup only once (on first install)
    (async () => {
        const warned = await GM.getValue("unsupportedManagerWarned", false);

        if (typeof GM_xmlhttpRequest !== "function" && !warned) {
            alert(
            "gmoodring: Hey! This is the 'Grok's Mood Ring' script.\n\n" +
            "Your userscript manager doesn't support the GM_xmlhttpRequest function this script relies on.\n\n" +
            "Please switch to TamperMonkey, ViolentMonkey, and/or FireMonkey.\n" +
            "Unfortunately, GreaseMonkey isn't supported. Thanks, and have a great day!"
        );

        await GM.setValue("unsupportedManagerWarned", true);
    }
})();

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
    let exhaustedWaitSeconds = 0;
    let windowHours = 0;

    // --- Fuel gauge helpers ---
    function getFuelPercent() {
        if (remainingTokens === 0 && exhaustedWaitSeconds > 0) return 0;
        if (totalTokens === 0) return 0;

        const pct = remainingTokens / totalTokens;

        // Non-linear smoothing (feels like a real gas tank)
        return Math.round(Math.pow(pct, 0.65) * 100);
    }

    function updateFuelBar() {
        const bar = document.getElementById("fuelbar");
        if (!bar) return;

        const pct = getFuelPercent();
        bar.style.width = pct + "%";

        let color = "red";
        if (pct >= 70) color = "limegreen";
        else if (pct >= 40) color = "gold";
        else if (pct >= 10) color = "orange";

        if (remainingTokens === 0 && exhaustedWaitSeconds > 0) {
            color = "purple";
        }

        bar.style.background = color;
    }


    // --- Update widget text ---
    function renderBox() {

        // Hard exhausted mode
        if (remainingTokens === 0 && exhaustedWaitSeconds > 0) {
            const h = Math.floor(exhaustedWaitSeconds / 3600);
            const m = Math.floor((exhaustedWaitSeconds % 3600) / 60);
            const s = exhaustedWaitSeconds % 60;

            box.innerHTML =
                `<div style="font-weight:bold; margin-bottom:6px; text-align:center;">
        Grok's Mood Ring 3.2
     </div>
     <div style="width:100%; height:6px; background:#333; border-radius:4px; margin:6px 0;">
        <div id="fuelbar" style="height:100%; width:0%; background:limegreen; border-radius:4px; transition: width 0.4s ease, background 0.4s ease;"></div>
     </div>` +
                `Tokens: 0/${totalTokens}<br>` +
                `Rate limit resets in: ${h}h ${m}m ${s}s<br>` +
                `Rolling window: ${windowHours}h`;
            updateFuelBar();

            return;
        }

        // Normal mode
        const h = Math.floor(nextTokenSeconds / 3600);
        const m = Math.floor((nextTokenSeconds % 3600) / 60);
        const s = nextTokenSeconds % 60;

        box.innerHTML =
            `<div style="font-weight:bold; margin-bottom:6px; text-align:center;">
        Grok's Mood Ring 3.2
     </div>
     <div style="width:100%; height:6px; background:#333; border-radius:4px; margin:6px 0;">
        <div id="fuelbar" style="height:100%; width:0%; background:limegreen; border-radius:4px; transition: width 0.4s ease, background 0.4s ease;"></div>
     </div>` +
            `Tokens: ${remainingTokens}/${totalTokens}<br>` +
            `Next token: ${h}h ${m}m ${s}s<br>` +
            `Rolling window: ${windowHours}h`;
        updateFuelBar();
    }

    // --- UI nudge ---
    function nudgeGrokUI() {
        const input = document.querySelector("textarea");
        if (input) {
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    // --- Fetch rate limits (POST) ---
    let lastRemaining = 0;

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
                    const waitLow = json.lowEffortRateLimits.waitTimeSeconds;
                    const waitHigh = json.highEffortRateLimits.waitTimeSeconds;

                    // Hard exhausted mode
                    if (newRemaining === 0) {
                        const wait = Math.max(waitLow, waitHigh);
                        if (wait > 0) {
                            exhaustedWaitSeconds = wait;
                            nextTokenSeconds = 0;
                            remainingTokens = 0;
                            totalTokens = json.totalTokens;
                            windowHours = json.windowSizeSeconds / 3600;
                            renderBox();
                            return;
                        }
                    }

                    // Rolling window token return
                    if (newRemaining > lastRemaining) {
                        nextTokenSeconds = waitLow;
                    }

                    // UI stuck fix
                    if (waitLow === 0 && newRemaining > 0) {
                        nudgeGrokUI();
                    }

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

        // Hard exhausted countdown
        if (exhaustedWaitSeconds > 0) {
            exhaustedWaitSeconds--;
            renderBox();
            return;
        }

        // Normal countdown
        if (nextTokenSeconds > 0) {
            nextTokenSeconds--;
            renderBox();
        } else {
            // Poll every 10s when at zero
            if (!window._lastZeroPoll || Date.now() - window._lastZeroPoll > 10000) {
                window._lastZeroPoll = Date.now();
                fetchLimits();
            }
        }

    }, 1000);

    // --- Refresh after sending a message ---
    document.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            setTimeout(fetchLimits, 1500);
        }
    });

    // Initial fetch
    fetchLimits();

    // Safety net: periodic sync every 30 minutes
    setInterval(fetchLimits, 30 * 60 * 1000);

})();
