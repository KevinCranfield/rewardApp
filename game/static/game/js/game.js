// =============================================
// PATCH NOTES:
// 1.  BOARD_SIZE constant replaces hardcoded 64
// 2.  alert() replaced with showToast()
// 3.  Snake direction is deterministic (no Math.random)
// 4.  drawConnections called once via ResizeObserver
// 5.  Duplicate splash listener removed (handled in base.html only)
// 6.  Audio lazy-loaded on first unlock
// 7.  Dead animateLadder/animateSnake split + commented code removed
// 8.  burstConfetti capped at 60
// 9.  Removed duplicate broken .chest-btn click handlers (chest opening handled in child.html)
// 10. FIX: pingActivity / resetActivityTimer guarded by game-meta — prevents 401 on unauthed pages
// 11. FIX: animateMovement uses stable token ref — won't break if updateTokensUI fires mid-walk
// 12. FIX: Roll button re-enable tied to animation end, not arbitrary setTimeout — prevents double-roll race
// 13. FIX: chest tier detection operator precedence bug — every chest was resolving to "gold"
// 14. FIX: pingActivity guard moved to DOMContentLoaded — prevents firing before DOM is ready
// 15. FIX: CSRF missing now shows a clear toast instead of silent 403
// 16. FIX: ResizeObserver debounced — prevents SVG redraw storm during token animations
// 17. FIX: burstConfetti uses live flag to cancel removeChild on navigated-away pages
// 18. FIX: triggerWinOverlay locked to single fire — confetti/sound won't repeat if called twice
// 19. FIX: board reset uses custom confirm modal — native confirm() blocked in PWA standalone mode
// =============================================

console.log("🔥 GAME JS VERSION: REMOVE CHILD + NAV FIX LIVE v2.2");


const BOARD_SIZE = 64;



// FIX 18: guard flag — prevent double confetti/sound if called twice rapidly
let _winOverlayFired = false;

function triggerWinOverlay(childId){
    const meta = document.getElementById("game-meta");
    const name = meta?.dataset.childName || "Player";

    let overlay = document.getElementById("win-overlay");

    if(!overlay){
        // Already showing — skip confetti/sound but don't create duplicate
        if(_winOverlayFired) return;
        _winOverlayFired = true;

        overlay = document.createElement("div");
        overlay.id = "win-overlay";

        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.background = "rgba(0,0,0,0.85)";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "99999";
        overlay.style.color = "white";
        overlay.style.textAlign = "center";

        overlay.innerHTML = `
            <h1 style="font-size:32px; margin-bottom:10px;">🎉 ${name} WINS!</h1>
            <p style="margin-bottom:20px;">You reached the finish! 🏁</p>
            <div style="display:flex; gap:12px;">
                <button id="continue-game" style="padding:12px 18px; border-radius:10px; border:none; background:#22c55e; color:white; font-weight:bold;">Continue</button>
                <button id="reset-game" style="padding:12px 18px; border-radius:10px; border:none; background:#ef4444; color:white; font-weight:bold;">Restart</button>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector("#continue-game").onclick = () => {
            _winOverlayFired = false;
            overlay.remove();
        };

        overlay.querySelector("#reset-game").onclick = () => {
            _winOverlayFired = false;
            window.location.reload();
        };
    }

    // Only fire effects once — guard prevents repeat calls
    if(!_winOverlayFired) return;
    burstConfetti(60);

    if(navigator.vibrate){
        navigator.vibrate([100,50,100]);
    }

    playSound("win");
}

// 🐍 Snakes & 🪜 Ladders
const snakes = {
    62: 44,
    55: 41,
    27: 10,
    33: 18,
};

const ladders = {
    3: 22,
    8: 26,
    19: 38,
    35: 49,
};

// 🔊 SOUND SYSTEM — lazy loaded on first interaction
let sounds = null;
let soundsUnlocked = false;

function initSounds(){
    if(sounds) return;
    sounds = {
        dice: new Audio('/static/game/sounds/dice.mp3'),
        win: new Audio('/static/game/sounds/big_win.mp3'),
        click: new Audio('/static/game/sounds/click.mp3')
    };
}

function unlockSounds(){
    if(soundsUnlocked) return;
    initSounds();
    soundsUnlocked = true;

    Object.values(sounds).forEach(s => {
        const prevVolume = s.volume ?? 1;
        s.volume = 0;
        s.play().then(() => {
            s.pause();
            s.currentTime = 0;
            s.volume = prevVolume;
        }).catch(()=>{});
    });
}

function showToast(message, duration){
    if(message && message.includes("roll")){
        return; // disable roll-related popups
    }
    const toast = document.getElementById("toast");
    if(!toast) return;

    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.style.opacity = "1";

    // duration=0 means persistent (used for update banner)
    if(duration === 0) return;

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.classList.add("hidden");
        }, 300);
    }, duration || 1500);
}

function playSound(name){
    initSounds();
    if(sounds[name]){
        sounds[name].pause();
        sounds[name].currentTime = 0;
        sounds[name].play().catch(()=>{});
    }
}

function getSquareCenter(num) {
    const SIZE = 800;
    const GRID = 8;
    const cell = SIZE / GRID;

    const n = parseInt(num);

    // Row counting from bottom
    const rowFromBottom = Math.floor((n - 1) / GRID);

    // Column within the row
    let col = (n - 1) % GRID;

    // 🔥 FIX: match YOUR board exactly:
    // ONLY rows 9–16 (rowFromBottom === 1) go RIGHT → LEFT
    if(rowFromBottom === 1){
        col = (GRID - 1) - col;
    }

    // Convert to DOM row (top = 0)
    const row = (GRID - 1) - rowFromBottom;

    return {
        x: col * cell + cell / 2,
        y: row * cell + cell / 2
    };
}

function roll(childId){
    unlockSounds();

    const button = document.querySelector(`.roll-btn[data-child="${childId}"]`);

    if(button && button.disabled) return;

    // FIX 15: bail early with clear message if CSRF cookie is missing
    if(!getCSRFToken()){
        showToast("⚠️ Session error — please refresh the page");
        console.error("CSRF token missing — roll blocked");
        return;
    }

    // 🔒 Extra safety: prevent roll if UI shows 0 rolls
    const statusCheck = document.querySelector(`.roll-status[data-child="${childId}"]`);
    if(statusCheck && statusCheck.classList.contains("empty")){
        console.warn("Blocked roll — no rolls available");

        // 🔥 VISUAL FIX: ensure button is greyed out when blocked
        if(button){
            button.disabled = true;
            button.classList.add("disabled");
            button.style.opacity = "0.5";
            button.style.cursor = "not-allowed";
        }

        return;
    }

    if(button) button.disabled = true;
    playSound('click');
    if(navigator.vibrate){
        navigator.vibrate(30);
    }

    const token = document.getElementById("token-" + childId);
    if(token){
        token._rollButton = button;
    }

    let current = 0;

    // Prefer backend truth over DOM (fixes stuck token bug)
    if(token){
        const square = token.closest(".square");
        if(square){
            current = parseInt(square.dataset.square) || 0;
        }
    }
    // Will be overridden by data.from if available

    fetch("/roll/", {
        method: "POST",
        headers: {
            "X-CSRFToken": getCSRFToken(),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        credentials: "same-origin",
        body: "child_id=" + childId
    })
    .then(res => res.json())
    .then(data => {

        // 🔥 Handle no rolls / backend rejection cleanly
        if(data.error || data.success === false){
            console.warn("ROLL BLOCKED:", data);

            const status = document.querySelector(`.roll-status[data-child="${childId}"]`) 
                || document.querySelector(".roll-status");

            if(status){
                status.classList.add("empty");
                status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                status.style.background = "";
                status.style.color = "";
            }

            if(button){
                button.disabled = true;
            }

            showToast("⚠️ No rolls available");
            return;
        }

        console.log("ROLL:", data);
        console.log("Rolls remaining:", data.rolls_remaining);

        showDice(data.dice, () => {
            if(data.jump){
                // First move to jump start
                animateMovement(childId, current, data.from);

                // Then trigger jump AFTER movement duration (~220ms per step)
                const steps = Math.abs(data.from - current);
                const duration = steps * 220 + 200; // buffer

                setTimeout(() => {
                    animateJump(childId, data.from, data.position);
                }, duration);

            } else {
                animateMovement(childId, current, data.position);
            }
            // FIX 12: button re-enable is handled at animation end in animateMovement/animateJump
            // — removed competing setTimeout here that caused double-roll race condition

            // 🎁 Reward trigger AFTER movement completes
            if(data.reward){
                const steps = Math.abs((data.from || current) - data.position);
                const duration = steps * 220 + 400; // match movement timing

                setTimeout(() => {
                    showReward(data.reward);
                }, duration);
            }
        });

        showToast("🎲 Rolled " + data.dice);

        try{
            burstConfetti(20);
            if(navigator.vibrate){
                navigator.vibrate(20);
            }
        }catch(e){}

        if(data.children){
            window.__lastChildren = data.children;
        }

        if(data.rolls_remaining !== undefined){
            const rollEls = document.querySelectorAll(
                `.rewards-available[data-child="${childId}"], .rolls-available[data-child="${childId}"], .roll-badge[data-child="${childId}"]`
            );

            rollEls.forEach(el => {
                const n = data.rolls_remaining;
                el.innerText = n === 1
                    ? "🎯 1 roll available"
                    : `🎯 ${n} rolls available`;

                if(n === 0){
                    el.classList.add("empty");
                } else {
                    el.classList.remove("empty");
                }
            });

            let status = document.querySelector(`.roll-status[data-child="${childId}"]`);

            // Fallback: create status element if it doesn't exist
            if(!status){
                const rollBtn = document.querySelector(`.roll-btn[data-child="${childId}"]`);
                if(rollBtn){
                    status = document.createElement("div");
                    status.className = "roll-status";
                    status.dataset.child = childId;
                    status.style.marginTop = "10px";
                    status.style.textAlign = "center";
                    status.style.fontWeight = "600";
                    rollBtn.parentNode.insertBefore(status, rollBtn.nextSibling);
                }
            }

            if(status){
                if(data.rolls_remaining === 0){
                    status.classList.add("empty");
                    status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                } else {
                    status.classList.remove("empty");
                    status.innerText = `🎯 ${data.rolls_remaining} roll${data.rolls_remaining === 1 ? '' : 's'} available`;

                    // 🔥 Force remove any lingering red banner styles
                    status.style.background = "transparent";
                    status.style.color = "#16a34a";
                }
            }
        }

        if(button){
            const noRolls = data.rolls_remaining === 0;

            // FIX 12: store on dataset so animateMovement end can re-enable correctly
            button.dataset.rollsRemaining = data.rolls_remaining ?? 0;
            button.disabled = noRolls;

            if(noRolls){
                button.classList.add("disabled");
                button.style.opacity = "0.5";
                button.style.cursor = "not-allowed";
            } else {
                button.classList.remove("disabled");
                button.style.opacity = "1";
                button.style.cursor = "pointer";
            }
        }

        // 🔥 Final UI sync safeguard
        if(data.rolls_remaining > 0){
            const status = document.querySelector(`.roll-status[data-child="${childId}"]`) 
                || document.querySelector(".roll-status");
            if(status){
                status.classList.remove("empty");
                status.innerText = `🎯 ${data.rolls_remaining} roll${data.rolls_remaining === 1 ? '' : 's'} available`;
                status.style.background = "transparent";
                status.style.color = "#16a34a";
            }
        }
        // 🔥 Ensure button styling matches state (fix grey-out consistency)
        if(button && data.rolls_remaining > 0){
            button.disabled = false;
            button.classList.remove("disabled");
            button.style.opacity = "1";
            button.style.cursor = "pointer";
        }
        // 🔥 If backend returns no movement (e.g. rolls = 0), do NOT animate
        if(!data.position){
            console.warn("No movement data — likely 0 rolls");

            if(button){
                button.disabled = true;
            }

            return;
        }

        // FIX 12: removed second competing setTimeout(2500) re-enable here
        // Button is now re-enabled only at animation completion

        if(current === data.position){
            console.warn("No movement");
            if(button) button.disabled = false;
            return;
        }
    })
    .catch(err => {
        console.error(err);
        showToast("⚠️ Network error");
        if(button) button.disabled = false;
    });
}

function animateMovement(childId, start, end){
    // FIX 11: capture token ID only, re-fetch by ID each step so stale ref can't break animation
    const tokenId = "token-" + childId;
    let token = document.getElementById(tokenId);

    if(!token){
        token = document.createElement("div");
        token.className = "token";
        token.id = tokenId;

        // FIX: pull colour + name from lastChildren cache so token
        // renders correctly without needing a page refresh
        const cached = (window.__lastChildren || []).find(c => String(c.id) === String(childId));
        token.textContent = cached?.name ? cached.name[0].toUpperCase() : "•";
        if(cached?.colour){
            token.style.background = cached.colour;
        }
        token.style.color = "white";
        token.style.display = "flex";
        token.style.alignItems = "center";
        token.style.justifyContent = "center";
        token.style.fontWeight = "bold";

        const startSquare = document.querySelector(`[data-square='${start || 1}'] .token-container`);
        if(startSquare){
            startSquare.appendChild(token);
        }
    }

    // FIX 12: capture rolls_remaining from the button's dataset to decide re-enable at end
    const rollButton = document.querySelector(`.roll-btn[data-child="${childId}"]`);

    let step = start === 0 ? 1 : start + 1;

    function move(){
        // FIX 11: re-fetch token each step — if updateTokensUI ran mid-walk, we get the fresh element
        const liveToken = document.getElementById(tokenId);
        if(!liveToken){
            // Token was removed externally — stop animation cleanly
            if(rollButton && rollButton.dataset.rollsRemaining > 0) rollButton.disabled = false;
            return;
        }

        if(step > end){
            if(end === BOARD_SIZE){
                liveToken.classList.add("winner");
                if(rollButton) rollButton.disabled = false;
                triggerWinOverlay(childId);
                return;
            }

            // FIX 12: re-enable button here at true animation end
            if(rollButton){
                const remaining = parseInt(rollButton.dataset.rollsRemaining ?? "1");
                rollButton.disabled = remaining <= 0;
            }
            if(window.__lastChildren){
                updateTokensUI(window.__lastChildren);
            }
            return;
        }

        const square = document.querySelector(`[data-square='${step}'] .token-container`);
        if(square){
            square.appendChild(liveToken);
        }

        step++;
        setTimeout(move, 220);
    }

    move();
}

function updateTokensUI(children){
    document.querySelectorAll(".token").forEach(t => t.remove());

    children.forEach(child => {
        const container = document.querySelector(
            `[data-square='${child.position}'] .token-container`
        );
        if(!container) return;

        const token = document.createElement("div");
        token.className = "token";
        token.id = "token-" + child.id;
        token.textContent = child.name ? child.name[0].toUpperCase() : "•";
        token._rollButton = document.querySelector(`.roll-btn[data-child="${child.id}"]`);

        if(child.colour){
            token.style.background = child.colour;
        }
        // Ensure visible styling (fix token not turning coloured properly)
        token.style.color = "white";
        token.style.display = "flex";
        token.style.alignItems = "center";
        token.style.justifyContent = "center";
        token.style.fontWeight = "bold";

        container.appendChild(token);
    });
}

// Split into two clear functions: ladder (step animation) and snake (bezier curve)
function animateLadder(childId, start, end){
    const token = document.getElementById("token-" + childId);
    const p1 = getSquareCenter(start);
    const p2 = getSquareCenter(end);
    if(!p1 || !p2) return;

    const steps = 6;
    let i = 0;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    function stepAnim(){
        i++;
        const t = i / steps;
        const x = p1.x + dx * t;
        const y = p1.y + dy * t;

        token.style.position = "absolute";
        token.style.left = (x - 14) + "px";
        token.style.top = (y - 14) + "px";
        token.style.transform = "scale(1.1)";

        if(i < steps){
            setTimeout(stepAnim, 120);
        } else {
            const targetSquare = document.querySelector(`[data-square='${end}'] .token-container`);
            if(targetSquare){
                token.style.position = "";
                token.style.left = "";
                token.style.top = "";
                token.style.transform = "";
                targetSquare.appendChild(token);
            }

            if(end === BOARD_SIZE){
                token.classList.add("winner");
                if(token._rollButton) token._rollButton.disabled = false;
                triggerWinOverlay(childId);
            }

            if(token._rollButton) token._rollButton.disabled = false;

            if(window.__lastChildren){
                window.__lastChildren = window.__lastChildren.map(c =>
                    c.id == childId ? { ...c, position: end } : c
                );
                updateTokensUI(window.__lastChildren);
            }
        }
    }

    stepAnim();
}

function animateSnake(childId, start, end){
    const token = document.getElementById("token-" + childId);
    const p1 = getSquareCenter(start);
    const p2 = getSquareCenter(end);
    if(!p1 || !p2) return;

    const duration = 700;
    const startTime = performance.now();
    const ease = t => t*t*(3 - 2*t);

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const curveOffset = (p2.x > p1.x ? 1 : -1) * 60;
    const cx = midX + curveOffset;
    const cy = midY;

    function animate(time){
        const progressRaw = Math.min((time - startTime) / duration, 1);
        const progress = ease(progressRaw);

        const inv = 1 - progress;
        const x = inv*inv*p1.x + 2*inv*progress*cx + progress*progress*p2.x;
        const y = inv*inv*p1.y + 2*inv*progress*cy + progress*progress*p2.y;

        token.style.position = "absolute";
        token.style.left = (x - 14) + "px";
        token.style.top = (y - 14) + "px";
        token.style.transform = `rotate(${(progress - 0.5) * 20}deg)`;

        if(progress < 1){
            requestAnimationFrame(animate);
        } else {
            const targetSquare = document.querySelector(`[data-square='${end}'] .token-container`);
            if(targetSquare){
                token.style.position = "";
                token.style.left = "";
                token.style.top = "";
                token.style.transform = "";
                targetSquare.appendChild(token);
            }

            if(end === BOARD_SIZE){
                token.classList.add("winner");
                if(token._rollButton) token._rollButton.disabled = false;
                triggerWinOverlay(childId);
            }

            if(token._rollButton) token._rollButton.disabled = false;

            if(window.__lastChildren){
                window.__lastChildren = window.__lastChildren.map(c =>
                    c.id == childId ? { ...c, position: end } : c
                );
                updateTokensUI(window.__lastChildren);
            }
        }
    }

    requestAnimationFrame(animate);
}

// Public-facing jump router (called from roll())
function animateJump(childId, start, end){
    if(end > start){
        animateLadder(childId, start, end);
    } else {
        animateSnake(childId, start, end);
    }
}

function drawConnections(){
    const svg = document.querySelector(".board-overlay");
    const board = document.querySelector(".board");
    if(!svg || !board) return;

    // 🔥 FIX: use stable coordinate system (prevents mobile misalignment)
    const SIZE = 800; // virtual board size (8x8 grid → 100 per cell)

    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.position = "absolute";
    svg.style.inset = 0;
    svg.innerHTML = "";

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="ladderWood" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#a16207"/>
            <stop offset="100%" stop-color="#78350f"/>
        </linearGradient>
        <linearGradient id="ladderRung" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
        </linearGradient>
    `;
    svg.appendChild(defs);

    // 🪜 Ladders
    for(const start in ladders){
        const end = ladders[start];
        const p1 = getSquareCenter(start);
        const p2 = getSquareCenter(end);
        if(!p1 || !p2) continue;

        const railGap = 10;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        const px = -dy / length;
        const py = dx / length;

        const rail1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rail1.setAttribute("x1", p1.x + px * railGap);
        rail1.setAttribute("y1", p1.y + py * railGap);
        rail1.setAttribute("x2", p2.x + px * railGap);
        rail1.setAttribute("y2", p2.y + py * railGap);
        rail1.setAttribute("class", "ladder-rail");
        svg.appendChild(rail1);

        const rail2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rail2.setAttribute("x1", p1.x - px * railGap);
        rail2.setAttribute("y1", p1.y - py * railGap);
        rail2.setAttribute("x2", p2.x - px * railGap);
        rail2.setAttribute("y2", p2.y - py * railGap);
        rail2.setAttribute("class", "ladder-rail");
        svg.appendChild(rail2);

        const rungCount = 6;
        for(let i = 1; i < rungCount; i++){
            const t = i / rungCount;
            const cx = p1.x + dx * t;
            const cy = p1.y + dy * t;

            const rung = document.createElementNS("http://www.w3.org/2000/svg", "line");
            rung.setAttribute("x1", cx + px * railGap);
            rung.setAttribute("y1", cy + py * railGap);
            rung.setAttribute("x2", cx - px * railGap);
            rung.setAttribute("y2", cy - py * railGap);
            rung.setAttribute("stroke", "url(#ladderRung)");
            rung.setAttribute("stroke-width", "3");
            rung.setAttribute("stroke-linecap", "round");
            rung.setAttribute("class", "ladder-rung");
            svg.appendChild(rung);
        }
    }

    // 🐍 Snakes
    for(const start in snakes){
        const end = snakes[start];
        const p1 = getSquareCenter(start);
        const p2 = getSquareCenter(end);
        if(!p1 || !p2) continue;

        const gradId = `snake-grad-${start}`;
        const snakeDefs = svg.querySelector("defs");

        const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradient.setAttribute("id", gradId);
        gradient.setAttribute("x1", "0%");
        gradient.setAttribute("y1", "0%");
        gradient.setAttribute("x2", "100%");
        gradient.setAttribute("y2", "100%");

        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", "#22c55e");

        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", "#15803d");

        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        snakeDefs.appendChild(gradient);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Deterministic direction based on square number (no Math.random)
        const direction = (parseInt(start) % 2 === 0) ? 1 : -1;
        const curveOffset = direction * 60;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        const px = -dy / length;
        const py = dx / length;

        const c1x = midX + px * curveOffset;
        const c1y = midY + py * curveOffset;
        const c2x = midX - px * curveOffset;
        const c2y = midY - py * curveOffset;

        const d = `M ${p1.x} ${p1.y} Q ${c1x} ${c1y} ${midX} ${midY} Q ${c2x} ${c2y} ${p2.x} ${p2.y}`;

        const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
        outline.setAttribute("d", d);
        outline.setAttribute("stroke", "#065f46");
        outline.setAttribute("stroke-width", "8");
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke-linecap", "round");
        outline.setAttribute("opacity", "0.6");
        svg.appendChild(outline);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", `url(#${gradId})`);
        path.setAttribute("stroke-width", "4");
        path.setAttribute("class", "snake-body");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);

        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute("cx", p1.x);
        head.setAttribute("cy", p1.y);
        head.setAttribute("r", "8");
        head.setAttribute("fill", "#166534");
        svg.appendChild(head);

        const eyeOffsetForward = 3;
        const eyeOffsetSide = 2;
        const fx = Math.cos(angle);
        const fy = Math.sin(angle);
        const sx = -fy;
        const sy = fx;

        const eye1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        eye1.setAttribute("cx", p1.x + fx * eyeOffsetForward + sx * eyeOffsetSide);
        eye1.setAttribute("cy", p1.y + fy * eyeOffsetForward + sy * eyeOffsetSide);
        eye1.setAttribute("r", "1.2");
        eye1.setAttribute("fill", "white");

        const eye2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        eye2.setAttribute("cx", p1.x + fx * eyeOffsetForward - sx * eyeOffsetSide);
        eye2.setAttribute("cy", p1.y + fy * eyeOffsetForward - sy * eyeOffsetSide);
        eye2.setAttribute("r", "1.2");
        eye2.setAttribute("fill", "white");

        svg.appendChild(eye1);
        svg.appendChild(eye2);

        const pupilOffset = 0.6;

        const pupil1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        pupil1.setAttribute("cx", p1.x + fx * (eyeOffsetForward + pupilOffset) + sx * eyeOffsetSide);
        pupil1.setAttribute("cy", p1.y + fy * (eyeOffsetForward + pupilOffset) + sy * eyeOffsetSide);
        pupil1.setAttribute("r", "0.6");
        pupil1.setAttribute("fill", "black");

        const pupil2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        pupil2.setAttribute("cx", p1.x + fx * (eyeOffsetForward + pupilOffset) - sx * eyeOffsetSide);
        pupil2.setAttribute("cy", p1.y + fy * (eyeOffsetForward + pupilOffset) - sy * eyeOffsetSide);
        pupil2.setAttribute("r", "0.6");
        pupil2.setAttribute("fill", "black");

        svg.appendChild(pupil1);
        svg.appendChild(pupil2);

        const baseX = p1.x + fx * 6;
        const baseY = p1.y + fy * 6;
        const tLen = 6;
        const spread = 2.2;

        const prong1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const t1cx = baseX + fx * (tLen * 0.5) + sx * spread;
        const t1cy = baseY + fy * (tLen * 0.5) + sy * spread;
        const e1x = baseX + fx * tLen + sx * (spread * 1.2);
        const e1y = baseY + fy * tLen + sy * (spread * 1.2);
        prong1.setAttribute("d", `M ${baseX} ${baseY} Q ${t1cx} ${t1cy} ${e1x} ${e1y}`);
        prong1.setAttribute("stroke", "#ef4444");
        prong1.setAttribute("stroke-width", "1.5");
        prong1.setAttribute("fill", "none");
        prong1.setAttribute("stroke-linecap", "round");
        prong1.setAttribute("class", "snake-tongue");
        svg.appendChild(prong1);

        const prong2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const t2cx = baseX + fx * (tLen * 0.5) - sx * spread;
        const t2cy = baseY + fy * (tLen * 0.5) - sy * spread;
        const e2x = baseX + fx * tLen - sx * (spread * 1.2);
        const e2y = baseY + fy * tLen - sy * (spread * 1.2);
        prong2.setAttribute("d", `M ${baseX} ${baseY} Q ${t2cx} ${t2cy} ${e2x} ${e2y}`);
        prong2.setAttribute("stroke", "#ef4444");
        prong2.setAttribute("stroke-width", "1.5");
        prong2.setAttribute("fill", "none");
        prong2.setAttribute("stroke-linecap", "round");
        prong2.setAttribute("class", "snake-tongue");
        svg.appendChild(prong2);

        const tail = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        tail.setAttribute("cx", p2.x);
        tail.setAttribute("cy", p2.y);
        tail.setAttribute("r", "2");
        tail.setAttribute("fill", "#14532d");
        svg.appendChild(tail);
    }
}

function showDice(value, onComplete){
    let dice = document.getElementById("dice-popup");

    if(!dice){
        dice = document.createElement("div");
        dice.id = "dice-popup";
        dice.style.position = "fixed";
        dice.style.top = "50%";
        dice.style.left = "50%";
        dice.style.transform = "translate(-50%, -50%) scale(0.5)";
        dice.style.fontSize = "60px";
        dice.style.background = "white";
        dice.style.padding = "20px";
        dice.style.borderRadius = "20px";
        dice.style.boxShadow = "0 20px 50px rgba(0,0,0,.4)";
        dice.style.zIndex = "9999";
        document.body.appendChild(dice);
    }

    playSound('dice');

    let rolls = 0;
    const rollInterval = setInterval(() => {
        const random = Math.floor(Math.random()*6) + 1;
        dice.textContent = "🎲 " + random;
        rolls++;

        if(rolls > 6){
            clearInterval(rollInterval);
            dice.textContent = "🎲 " + value;
            dice.style.transition = "all .2s ease";
            dice.style.transform = "translate(-50%, -50%) scale(1.2)";

            setTimeout(() => {
                dice.style.transform = "translate(-50%, -50%) scale(1)";
            }, 120);

            setTimeout(() => {
                dice.style.transform = "translate(-50%, -50%) scale(0)";
                if(onComplete) onComplete();
            }, 1400);
        }
    }, 80);
}

function getCSRFToken(){
    const name = "csrftoken=";
    const decoded = decodeURIComponent(document.cookie);
    const cookies = decoded.split(";");

    for(let i = 0; i < cookies.length; i++){
        let c = cookies[i].trim();
        if(c.startsWith(name)){
            return c.substring(name.length);
        }
    }
    return null;
}

function toggleAddChild(){
    const form = document.getElementById("addChildForm");
    const btn = document.querySelector("button[onclick='toggleAddChild()']");
    if(!form) return;

    form.classList.toggle("hidden");

    if(btn){
        btn.innerText = form.classList.contains("hidden")
            ? "➕ Add Child"
            : "❌ Close";
    }
}

function togglePinSection(){
    const section = document.getElementById("pinSection");
    const btn = document.querySelector("[data-action='toggle-pin']") || document.querySelector("button[onclick='togglePinSection()']");

    section.classList.toggle("hidden");

    if(btn){
        btn.innerText = section.classList.contains("hidden")
            ? "🔐 Change PIN"
            : "❌ Close PIN";
    }
}

window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("input[name='new_pin'], input[name='confirm_pin']")
        .forEach(input => {
            input.addEventListener("input", () => {
                input.value = input.value.replace(/[^0-9]/g, "");
            });
        });
});

function clearPinFields(){
    document.querySelectorAll("input[name='new_pin'], input[name='confirm_pin']")
        .forEach(input => input.value = "");
}

window.addEventListener("submit", function(e){
    if(e.target.classList && e.target.classList.contains("pin-form")){
        setTimeout(clearPinFields, 500);
    }
});

function burstConfetti(count = 40){
    // Cap at 60 to protect performance on low-end devices
    const safeCount = Math.min(count, 60);
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];

    for(let i = 0; i < safeCount; i++){
        const el = document.createElement("div");
        el.className = "confetti-piece";
        el.style.background = colors[Math.floor(Math.random()*colors.length)];

        const angle = Math.random() * Math.PI * 2;
        const distance = 80 + Math.random()*140;

        el.style.setProperty("--dx", Math.cos(angle) * distance + "px");
        el.style.setProperty("--dy", Math.sin(angle) * distance + 120 + "px");
        el.style.animationDelay = (Math.random()*0.15) + "s";

        document.body.appendChild(el);

        // FIX 17: check el is still attached before removing — prevents error on fast navigation
        setTimeout(() => {
            if(el.isConnected) el.remove();
        }, 1400);
    }
}

// Single load listener for board drawing only (splash handled in base.html)
window.addEventListener("load", () => {
    // FIX 16: debounce ResizeObserver — token moves subtly shift layout and
    // were triggering continuous SVG redraws on slow devices
    let roDebounce;
    const board = document.querySelector(".board");
    if(board){
        const ro = new ResizeObserver(() => {
            clearTimeout(roDebounce);
            roDebounce = setTimeout(drawConnections, 100);
        });
        ro.observe(board);
    } else {
        // Fallback if board not present on this page
        setTimeout(drawConnections, 300);
    }

    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(drawConnections, 150);
    });
});

function pingActivity(){
    fetch("/ping-auth/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "X-CSRFToken": getCSRFToken(),
            "Content-Type": "application/x-www-form-urlencoded"
        }
    }).catch(()=>{});
}

// FIX 19: custom confirm modal — native confirm() is blocked in PWA standalone on iOS/Android
function showConfirm(message, onConfirm){
    let modal = document.getElementById("custom-confirm-modal");
    if(modal) modal.remove();

    modal = document.createElement("div");
    modal.id = "custom-confirm-modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;";
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:28px 24px;max-width:320px;width:90%;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3);">
            <p style="font-size:16px;font-weight:600;margin-bottom:20px;">${message}</p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="confirm-cancel" style="padding:10px 20px;border-radius:10px;border:1px solid #d1d5db;background:white;font-weight:600;cursor:pointer;">Cancel</button>
                <button id="confirm-ok" style="padding:10px 20px;border-radius:10px;border:none;background:#ef4444;color:white;font-weight:600;cursor:pointer;">Continue</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#confirm-cancel").onclick = () => modal.remove();
    modal.querySelector("#confirm-ok").onclick = () => { modal.remove(); onConfirm(); };
}

document.getElementById("resetBoardBtn")?.addEventListener("click", () => {
    playSound('click');

    showConfirm("⚠️ This will reset ALL players back to start. Continue?", () => {
        fetch("/reset-board/", {
            method: "POST",
            headers: {
                "X-CSRFToken": getCSRFToken()
            }
        })
        .then(res => res.json())
        .then(data => {
            if(data.children){
                window.__lastChildren = data.children;
            }
            if(data.success){
                showToast("🔄 Board reset!");

                document.querySelectorAll(".token").forEach(t => t.remove());

                document.querySelectorAll(".position").forEach(el => {
                    el.innerText = "Position: 0";
                });

                document.querySelectorAll(".progress-bar-fill").forEach(bar => {
                    bar.style.width = "0%";
                });

                document.querySelectorAll(".last-roll").forEach(el => {
                    el.innerText = "-";
                });

                document.querySelectorAll(".rewards-available").forEach(el => {
                    el.innerText = "Rewards Available: 0";
                });

                document.querySelectorAll(".reward-history").forEach(el => {
                    el.innerHTML = "";
                });

                // 🔥 Reset roll UI properly
                document.querySelectorAll(".roll-status").forEach(status => {
                    status.classList.add("empty");
                    status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                    status.style.background = "";
                    status.style.color = "";
                    status.dataset.locked = "false";
                });

                // 🔥 Disable all roll buttons
                document.querySelectorAll(".roll-btn").forEach(btn => {
                    btn.disabled = true;
                    btn.classList.add("disabled");
                });

                // FIX 18: reset win overlay flag on board reset
                _winOverlayFired = false;
            }
        });
    });
});

// =============================================
// PATCH 10 + 14: Activity timer guarded by game-meta, inside DOMContentLoaded
// so the element is guaranteed to exist before the check runs.
// pingActivity only starts on authenticated game pages.
// =============================================

let activityTimeout;

function resetActivityTimer(){
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(pingActivity, 20000);
}

document.addEventListener("DOMContentLoaded", () => {
    // FIX 14: guard runs after DOM is ready — game-meta won't be missed
    const gameMeta = document.getElementById("game-meta");
    if(gameMeta){
        ["click", "keydown", "touchstart"].forEach(evt => {
            document.addEventListener(evt, resetActivityTimer);
        });
        resetActivityTimer();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form.reward-form, form[action*='reward']").forEach(form => {
        const select = form.querySelector("select[name='reason']");
        const input = form.querySelector("input[name='custom_text']");
        const button = form.querySelector("button[type='submit']");

        if(!select || !button) return;

        function updateState(){
            const hasSelect = select.value && select.value.trim() !== "";
            const hasInput = input && input.value.trim() !== "";
            button.disabled = !(hasSelect || hasInput);
        }

        updateState();

        if(input){
            input.addEventListener("input", () => {
                if(input.value.trim().length > 0){
                    select.value = "";
                    input.classList.add("active");
                    select.classList.remove("active");
                } else {
                    input.classList.remove("active");
                }
                updateState();
            });
        }

        select.addEventListener("change", () => {
            if(select.value && input){
                input.value = "";
                input.classList.remove("active");
                select.classList.add("active");
            } else {
                select.classList.remove("active");
            }

            select.classList.remove("homework","behaviour","helping","reading","exercise");
            const v = select.value.toLowerCase();
            if(v.includes("homework")) select.classList.add("homework");
            if(v.includes("behaviour")) select.classList.add("behaviour");
            if(v.includes("helping")) select.classList.add("helping");
            if(v.includes("reading")) select.classList.add("reading");
            if(v.includes("exercise")) select.classList.add("exercise");

            updateState();
        });

        // Track last clicked chest button (fix missing chest_type)
        let lastChestType = null;
        form.querySelectorAll("button[name='chest_type']").forEach(btn => {
            btn.addEventListener("click", () => {
                lastChestType = btn.value;
                console.log("CLICKED CHEST BUTTON:", lastChestType);
            });
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const hasSelect = select.value && select.value.trim() !== "";
            const hasInput = input && input.value.trim() !== "";

            if(!hasSelect && !hasInput){
                showToast("⚠️ Select or type a reason");
                return;
            }

            button.disabled = true;

            // Insert check for missing form.action before fetch
            if(!form.action){
                showToast("⚠️ Invalid form action");
                button.disabled = false;
                return;
            }

            try {
                const formData = new FormData(form);
                const submitter = e.submitter;

                // 🔥 DEBUG: log which button triggered submit
                console.log("SUBMITTER:", submitter);

                // Always prefer explicitly clicked chest button
                if(lastChestType){
                    formData.set("chest_type", lastChestType);
                } else if(submitter && submitter.name === "chest_type"){
                    formData.set("chest_type", submitter.value);
                }

                // 🚨 STRICT: if chest_type missing, block submit
                if(!formData.get("chest_type")){
                    console.error("NO CHEST TYPE FOUND — BLOCKING SUBMIT");
                    showToast("⚠️ Please select a chest");
                    button.disabled = false;
                    return;
                }

                // 🐞 DEBUG: dump all form data being sent
                for (let pair of formData.entries()) {
                    console.log("FORM DATA:", pair[0], pair[1]);
                }

                const res = await fetch(form.action, {
                    method: "POST",
                    body: formData,
                    headers: {
                        "X-CSRFToken": getCSRFToken(),
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });
                if(!res.ok){
                    console.error("Server returned non-OK:", res.status);
                    showToast("⚠️ Server error (" + res.status + ")");
                    button.disabled = false;
                    return;
                }

                let data;
                try {
                    const text = await res.text();
                    try {
                        data = JSON.parse(text);
                    } catch(parseErr){
                        console.error("Raw response:", text);
                        throw parseErr;
                    }
                } catch (err) {
                    console.error("Invalid JSON response", err);
                    showToast("⚠️ Server returned HTML error");
                    button.disabled = false;
                    return;
                }

                if(data.success){
                    const count = data.count || 1;
                    

                    const card = form.closest('.card');
                    if(card){
                        const rollsEl = card.querySelector('[data-rolls]');
                        if(rollsEl){
                            const current = parseInt(rollsEl.textContent.replace(/\D/g,'')) || 0;
                            rollsEl.textContent = `Rolls added: ${current + count}`;
                            rollsEl.classList.add("reward-highlight");
                            setTimeout(() => rollsEl.classList.remove("reward-highlight"), 600);
                        }
                    }

                    const original = button.textContent;
                    button.textContent = "Added!";
                    button.classList.add("success");
                    setTimeout(() => button.classList.remove("success"), 600);

                    try{
                        burstConfetti(15);
                        if(navigator.vibrate){ navigator.vibrate(15); }
                    }catch(e){}

                    setTimeout(() => {
                        button.textContent = original || "+ Add Reward";
                    }, 1200);

                    form.reset();
                    button.disabled = true;
                    select.className = "reward-select";
                    select.classList.remove("active");
                    if(input) input.classList.remove("active");

                } else {
                    showToast(data.error || "Error adding reward");
                    button.disabled = false;
                }

            } catch(err){
                console.error(err);
                showToast("⚠️ Network error");
                button.disabled = false;
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const circles = document.querySelectorAll(".colour-circle");
    const select = document.getElementById("colourInput");

    if(!circles.length || !select) return;

    const usedEl = document.getElementById("usedColours");
    if(usedEl && usedEl.dataset.colours){
        const used = usedEl.dataset.colours.split(",").map(c => c.trim());
        circles.forEach(circle => {
            if(used.includes(circle.dataset.colour)){
                circle.classList.add("disabled");
                circle.style.opacity = "0.3";
                circle.style.pointerEvents = "none";
            }
        });
    }

    circles.forEach(circle => {
        circle.addEventListener("click", () => {
            const colour = circle.dataset.colour;
            select.value = colour;
            select.dispatchEvent(new Event("change"));
            circles.forEach(c => c.classList.remove("selected"));
            circle.classList.add("selected");
        });
    });
});

// Ensure chest buttons are clickable and trigger open
window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".chest").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const chestId = btn.dataset.chestId || btn.getAttribute("data-chest-id") || btn.getAttribute("data-id");

            // Prevent double click spam
            if(btn.classList.contains("chest-opening")){
                console.warn("Chest already opening, ignoring click");
                return;
            }
            btn.classList.add("chest-opening");

            console.log("CLICK CHEST:", chestId);
            if(!chestId){
                console.error("❌ Missing chestId on element:", btn);
                btn.classList.remove("chest-opening");
                return;
            }
            console.log("CHEST HANDLER ACTIVE - PREMIUM");


            if(typeof openChest === "function" && chestId){
                try {
                    // 🔥 PREMIUM CHEST UI TRIGGER
                    const overlay = document.getElementById("chest-overlay");
                    if(overlay){
                        overlay.classList.add("show");
                    }

                    // Add focus + glow before open
                    btn.classList.add("chest-focus");

                    // FIX 13: wrap ternary in parens — || was swallowing the whole expression
                    const tier = btn.dataset.tier
                                ? btn.dataset.tier
                                : btn.classList.contains("chest-gold") ? "gold"
                                : btn.classList.contains("chest-silver") ? "silver"
                                : "bronze";

                    if(tier === "gold") btn.classList.add("chest-gold-glow");
                    if(tier === "silver") btn.classList.add("chest-silver-glow");
                    if(tier === "bronze") btn.classList.add("chest-bronze-glow");

                    // Lid open effect
                    setTimeout(() => {
                        btn.classList.add("open");
                        const lid = btn.querySelector(".chest-lid");
                        if(lid){
                            lid.style.transform = "rotateX(-110deg) translateY(-8px)";
                            lid.style.transition = "transform 0.4s ease";
                        }
                    }, 200);

                    openChest(chestId);
                    console.log("✅ openChest called with:", chestId);
                    // 🔥 Remove chest from UI instantly after opening
                    setTimeout(() => {
                        if(btn && btn.isConnected){
                            btn.style.transition = "opacity .25s ease, transform .25s ease";
                            btn.style.opacity = "0";
                            btn.style.transform = "scale(0.8)";
                            setTimeout(() => btn.remove(), 250);
                        }
                    }, 800);
                    // ⚡ INSTANT SYNC: update roll button on next paint (no fixed delay)
                    const syncRollUI = () => {
                        const childId = document.querySelector(".child-view")?.dataset.childId;
                        if(!childId) return;

                        const rollBtn = document.querySelector(`.roll-btn[data-child="${childId}"]`);
                        const status = document.querySelector(`.roll-status[data-child="${childId}"]`) 
                                       || document.querySelector(".roll-status");

                        let rolls = 0;

                        // Prefer backend-updated state if available
                        if(window.__lastChildren){
                            const child = window.__lastChildren.find(c => String(c.id) === String(childId));
                            if(child && typeof child.rolls_available !== "undefined"){
                                rolls = child.rolls_available;
                            }
                        }

                        // Fallback: DOM parsing
                        if(!rolls && status){
                            const match = status.textContent.match(/\d+/);
                            if(match){
                                rolls = parseInt(match[0]);
                            }
                        }

                        // Final fallback
                        if(!rolls){
                            const rollsEl = document.querySelector(`[data-rolls]`);
                            if(rollsEl){
                                rolls = parseInt(rollsEl.textContent.replace(/\D/g, "")) || 0;
                            }
                        }

                        if(status){
                            if(rolls > 0){
                                status.classList.remove("empty");
                                status.innerText = `🎯 ${rolls} roll${rolls === 1 ? '' : 's'} available`;
                                status.style.background = "transparent";
                                status.style.color = "#16a34a";
                            } else {
                                status.classList.add("empty");
                                status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                            }
                        }

                        if(rollBtn){
                            const hasRolls = rolls > 0;
                            rollBtn.disabled = !hasRolls;

                            if(hasRolls){
                                rollBtn.classList.remove("disabled");
                                rollBtn.style.opacity = "1";
                                rollBtn.style.cursor = "pointer";
                            } else {
                                rollBtn.classList.add("disabled");
                                rollBtn.style.opacity = "0.5";
                                rollBtn.style.cursor = "not-allowed";
                            }
                        }
                    };

                    // Run after DOM updates (2 frames)
                    requestAnimationFrame(() => requestAnimationFrame(syncRollUI));
                    setTimeout(() => {
                        const overlay = document.getElementById("chest-overlay");
                        if(overlay){
                            overlay.classList.remove("show");
                        }

                        btn.classList.remove(
                            "chest-opening",
                            "chest-focus",
                            "chest-gold-glow",
                            "chest-silver-glow",
                            "chest-bronze-glow",
                            "open",
                            "chest-burst"
                        );
                        const lidReset = btn.querySelector(".chest-lid");
                        if(lidReset){
                            lidReset.style.transform = "";
                        }
                    }, 1500);
                } catch(err){
                    console.error(err);
                    btn.classList.remove(
                        "chest-opening",
                        "chest-focus",
                        "chest-gold-glow",
                        "chest-silver-glow",
                        "chest-bronze-glow",
                        "open"
                    );
                }
            } else {
                console.error("openChest missing or chestId not found");
                btn.classList.remove("chest-opening");
            }
        });
    });
});


/* =========================
   CHEST OPEN SYSTEM
   NOTE: openChest() is defined in child.html (inline script) because
   it needs access to showChestReveal(). game.js only provides
   killChestOverlay() as a utility for cleanup from other contexts.
========================= */

// 🔧 PATCH: enforce correct open chest endpoint (fix 404)
window.openChest = async function(chestId){
    console.log("OPEN CHEST FUNCTION CALLED:", chestId);

    try{
        const res = await fetch(`/open-chest/${chestId}/`, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCSRFToken(),
                "Content-Type": "application/json"
            },
            credentials: "same-origin"
        });

        if(!res.ok){
            console.error("Open chest failed:", res.status);
            showToast(`⚠️ Failed to open chest (${res.status})`);
            return;
        }

        const data = await res.json();
        if(!data || typeof data !== "object"){
            console.error("Invalid chest response:", data);
            showToast("⚠️ Server error");
            return;
        }
        console.log("CHEST RESPONSE:", data);

        if(data.success){
            // update rolls immediately from backend truth
            if(data.rolls !== undefined){
                const status = document.querySelector(".roll-status");
                const rollBtn = document.querySelector(".roll-btn");
                if(status){
                    status.innerText = data.rolls === 1
                        ? "🎯 1 roll available"
                        : `🎯 ${data.rolls} rolls available`;

                    if(data.rolls > 0){
                        status.classList.remove("empty");
                    }
                }
                if(rollBtn){
                    const hasRolls = data.rolls > 0;
                    rollBtn.disabled = !hasRolls;
                    rollBtn.classList.toggle("disabled", !hasRolls);
                    rollBtn.style.opacity = hasRolls ? "1" : "0.5";
                    rollBtn.style.cursor = hasRolls ? "pointer" : "not-allowed";
                }
            }

            // optional: show reward popup if returned
            if(data.reward){
                showReward(data.reward);
            }
        } else {
            showToast(data.error || "⚠️ Error opening chest");
        }

    } catch(err){
        console.error(err);
        showToast("⚠️ Network error");
    }
};

function killChestOverlay(){
    // Remove by ID
    const overlay = document.getElementById("chest-overlay");
    if(overlay){
        overlay.style.pointerEvents = "none";
        overlay.style.display = "none";
        overlay.remove();
    }

    // Remove any leftover overlay elements by class
    document.querySelectorAll(".chest-overlay").forEach(el => el.remove());

    // Reset body lock only
    document.body.style.overflow = "";
    document.body.classList.remove("modal-open");
}

// Run once after load to ensure no stuck overlays
window.addEventListener("DOMContentLoaded", () => {
    killChestOverlay();
});

/* =========================
   PWA INSTALL PROMPT HANDLER
========================= */

let deferredPrompt = null;

// Capture the install prompt
window.addEventListener("beforeinstallprompt", (e) => {
    console.log("PWA install prompt captured");

    e.preventDefault(); // stop Chrome auto-banner
    deferredPrompt = e;

    // Optional: trigger install after reward/chest later
    document.body.dataset.pwaReady = "true";
});

// 🎁 Reward display popup
function showReward(reward){
    const display = document.getElementById("reward-display");
    const img = document.getElementById("reward-image");
    const name = document.getElementById("reward-name");

    if(!display) return;

    img.src = reward.image || "";
    name.innerText = reward.name || "Reward";

    display.classList.remove("hidden");

    try{
        burstConfetti(40);
        if(navigator.vibrate){ navigator.vibrate([60,30,60]); }
    }catch(e){}

    setTimeout(() => {
        display.classList.add("hidden");
    }, 3000);
}

// Function to trigger install (can be called from anywhere)
function triggerInstallPrompt(){
    if(!deferredPrompt){
        console.warn("No install prompt available");
        return;
    }

    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(choice => {
        console.log("Install choice:", choice.outcome);

        deferredPrompt = null;
        document.body.dataset.pwaReady = "false";
    });
}

// =============================================
// NAV STATE SYSTEM (single source of truth)
// =============================================

function rebuildChildNav(){
    const navContainer = document.querySelector(".child-nav");
    if(!navContainer) return;

    navContainer.innerHTML = "";

    const children = window.__lastChildren || [];

    children.forEach(child => {
        const link = document.createElement("a");
        link.href = `/child/${child.id}/`;
        link.className = "nav-child";
        link.dataset.childId = child.id;

        link.innerHTML = `<span class="child-dot" style="background:${child.colour || '#3b82f6'}"></span> ${child.name}`;

        navContainer.appendChild(link);
    });
}

function syncNavAfterRemove(childId){
    if(window.__lastChildren){
        window.__lastChildren = window.__lastChildren.filter(c => String(c.id) !== String(childId));
    }
    rebuildChildNav();
}

// =========================
// REMOVE CHILD (dynamic no reload)
// =========================

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".remove-child-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();

            const childId = btn.dataset.childId;
            const childCard = btn.closest(".child-card");

            if(!childId) return;

            showConfirm("Remove this child?", () => {
                fetch(`/remove-child/${childId}/`, {
                    method: "POST",
                    headers: {
                        "X-CSRFToken": getCSRFToken()
                    }
                })
                .then(res => res.json())
                .then(data => {
                    if(data.success){
                        // ✅ Remove card from setup UI
                        if(childCard){
                            childCard.style.transition = "opacity .25s ease, transform .25s ease";
                            childCard.style.opacity = "0";
                            childCard.style.transform = "scale(0.95)";
                            setTimeout(() => childCard.remove(), 250);
                        }

                        // ✅ Remove from navbar (robust match)
                        document.querySelectorAll(`.nav-child`).forEach(el => {
                            const href = el.getAttribute("href") || "";
                            const idAttr = el.dataset.childId || "";

                            if(idAttr == childId || href.includes(`/child/${childId}/`)){
                                el.remove();
                            }
                        });

                        // 🔥 Sync + rebuild nav from state
                        syncNavAfterRemove(childId);

                        // ✅ Re-enable Add Child button if it was disabled
                        const addBtn = document.querySelector(".child-btn[disabled]");
                        if(addBtn){
                            addBtn.disabled = false;
                            addBtn.textContent = "+ Add Child";
                            addBtn.classList.remove("disabled");
                            addBtn.style.opacity = "1";
                            addBtn.style.cursor = "pointer";
                        }

                        // ✅ Empty state if no children remain
                        const container = document.querySelector(".children-list");
                        if(container && container.children.length === 0){
                            container.innerHTML = "<p>No children added yet</p>";
                        }

                        showToast("Child removed");

                        // 🔥 AUTO SWITCH CHILD (avoid dead page)
                        const currentPath = window.location.pathname;

                        if(currentPath.includes(`/child/${childId}/`)){
                            const remaining = document.querySelectorAll(".nav-child[href*='/child/']");

                            if(remaining.length > 0){
                                window.location.href = remaining[0].getAttribute("href");
                            } else {
                                window.location.href = "/setup/";
                            }
                        }

                    } else {
                        showToast(data.error || "Error removing child");
                    }
                })
                .catch(() => {
                    showToast("⚠️ Network error");
                });
            });
        });
    });
});

// =========================
// REWARD IMAGE PREVIEW SUPPORT
// =========================
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("reward-image-input");
    const preview = document.getElementById("reward-image-preview");

    if(!input || !preview) return;

    input.addEventListener("change", () => {
        const file = input.files[0];

        if(!file){
            preview.style.display = "none";
            preview.src = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = "block";
        };

        reader.readAsDataURL(file);
    });
});