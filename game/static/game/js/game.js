// =============================================
// PATCH NOTES:
// 1. BOARD_SIZE constant replaces hardcoded 64
// 2. alert() replaced with showToast()
// 3. Snake direction is deterministic (no Math.random)
// 4. drawConnections called once via ResizeObserver
// 5. Duplicate splash listener removed (handled in base.html only)
// 6. Audio lazy-loaded on first unlock
// 7. Dead animateLadder/animateSnake split + commented code removed
// 8. burstConfetti capped at 60
// =============================================



const BOARD_SIZE = 64;



function triggerWinOverlay(childId){
    const meta = document.getElementById("game-meta");
    const name = meta?.dataset.childName || "Player";

    let overlay = document.getElementById("win-overlay");

    if(!overlay){
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
            overlay.remove();
        };

        overlay.querySelector("#reset-game").onclick = () => {
            window.location.reload();
        };
    }

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

function getSquareCenter(num){
    const el = document.querySelector(`[data-square='${num}']`);
    const board = document.querySelector(".board");

    if(!el || !board) return null;

    const elRect = el.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    return {
        x: (elRect.left - boardRect.left) + (elRect.width / 2),
        y: (elRect.top - boardRect.top) + (elRect.height / 2)
    };
}

function roll(childId){
    unlockSounds();

    const button = document.querySelector(`.roll-btn[data-child="${childId}"]`);

    if(button && button.disabled) return;
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

    if(token){
        const square = token.closest(".square");
        if(square){
            current = parseInt(square.dataset.square);
        }
    }

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

        if(data.error){
            showToast("⚠️ " + data.error);
            if(button) button.disabled = false;
            return;
        }

        console.log("ROLL:", data);
        console.log("Rolls remaining:", data.rolls_remaining);

        showDice(data.dice, () => {
            if(data.jump){
                animateMovement(childId, current, data.from);
                setTimeout(() => {
                    animateJump(childId, data.from, data.position);
                }, 800);
            } else {
                animateMovement(childId, current, data.position);
            }

            setTimeout(() => {
                if(button && data.rolls_remaining > 0){
                    button.disabled = false;
                }
            }, 1500);
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

            const status = document.querySelector(`.roll-status[data-child="${childId}"]`);
            if(status){
                if(data.rolls_remaining === 0){
                    status.classList.add("empty");
                    status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                } else {
                    status.classList.remove("empty");
                    status.innerText = "🎲 Tap roll to play";
                }
            }
        }

        if(button){
            if(data.rolls_remaining === 0){
                button.disabled = true;
            } else {
                setTimeout(() => {
                    button.disabled = false;
                }, 1200);
            }
        }

        if(!data.position){
            console.warn("No movement data");
            if(button) button.disabled = false;
            setTimeout(() => {
                if(button) button.disabled = false;
            }, 2500);
            return;
        }

        setTimeout(() => {
            if(button && data.rolls_remaining > 0){
                button.disabled = false;
            }
        }, 2500);

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
    let token = document.getElementById("token-" + childId);

    if(!token){
        token = document.createElement("div");
        token.className = "token";
        token.id = "token-" + childId;
        token.textContent = "•";

        const startSquare = document.querySelector(`[data-square='${start || 1}'] .token-container`);
        if(startSquare){
            startSquare.appendChild(token);
        }
    }

    let step = start === 0 ? 1 : start + 1;

    function move(){
        if(step > end){
            if(end === BOARD_SIZE){
                token = document.getElementById("token-" + childId);
                if(token){
                    token.classList.add("winner");
                }
                if(token && token._rollButton){
                    token._rollButton.disabled = false;
                }
                triggerWinOverlay(childId);
                return;
            }

            if(token && token._rollButton){
                token._rollButton.disabled = false;
            }
            if(window.__lastChildren){
                updateTokensUI(window.__lastChildren);
            }
            return;
        }

        const square = document.querySelector(`[data-square='${step}'] .token-container`);
        if(square){
            square.appendChild(token);
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
        token.textContent = "•";
        token._rollButton = document.querySelector(`.roll-btn[data-child="${child.id}"]`);

        if(child.colour){
            token.style.background = child.colour;
        }

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

    const rect = board.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
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
        setTimeout(() => el.remove(), 1400);
    }
}

// Single load listener for board drawing only (splash handled in base.html)
window.addEventListener("load", () => {
    // Use ResizeObserver for reliable single-fire board drawing
    const board = document.querySelector(".board");
    if(board){
        const ro = new ResizeObserver(() => {
            drawConnections();
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
        headers: {
            "X-CSRFToken": getCSRFToken()
        }
    }).catch(()=>{});
}

document.getElementById("resetBoardBtn")?.addEventListener("click", () => {
    playSound('click');

    const confirmReset = confirm("⚠️ This will reset ALL players back to start. Continue?");
    if(!confirmReset) return;

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
        }
    });
});

let activityTimeout;

function resetActivityTimer(){
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(pingActivity, 2000);
}

["click", "keydown", "touchstart"].forEach(evt => {
    document.addEventListener(evt, resetActivityTimer);
});

resetActivityTimer();

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
                if(submitter && submitter.name === "rolls"){
                    formData.set("rolls", submitter.value);
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
                    showToast(`🎉 +${count} roll${count > 1 ? 's' : ''} added!`);

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

/* =========================
   CHEST OPEN SYSTEM
========================= */

function openChest(chestId){
    const el = document.querySelector(`[data-chest-id='${chestId}']`);
    if(!el) return;

    const childId = el.dataset.childId;
    if(!childId){
        console.error("Missing childId on chest element");
        showToast("⚠️ Invalid chest");
        return;
    }

    // add animation

    playSound("click");

    setTimeout(() => {
        fetch("/open-chest/", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "X-CSRFToken": getCSRFToken(),
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                chest_id: chestId,
                child_id: childId
            })
        })
        .then(async res => {
            if(!res.ok){
                const text = await res.text();
                console.error("OPEN CHEST ERROR:", res.status, text);
                showToast("⚠️ Server error (" + res.status + ")");
                throw new Error("Server error");
            }
            return res.json();
        })
        .then(data => {
            if(data.success){
                // 🔥 Immediate hard remove of overlay FIRST (before anything else)
                killChestOverlay();

                // remove chest visually
                el.classList.add("chest-opened");

                // Overlay already handled by killChestOverlay()

                // show reward
                const added = data.rolls || 0;
                const total = data.rolls_remaining;

                // 🎉 Floating popup (non-blocking, no overlay)
                let popup = document.createElement("div");
                popup.className = "chest-popup";
                popup.innerText = `🎁 +${added} roll${added === 1 ? "" : "s"}` + (total !== undefined ? ` | Total: ${total}` : "");

                popup.style.position = "fixed";
                popup.style.top = "30%";
                popup.style.left = "50%";
                popup.style.transform = "translate(-50%, -50%) scale(0.8)";
                popup.style.background = "rgba(0,0,0,0.85)";
                popup.style.color = "white";
                popup.style.padding = "16px 22px";
                popup.style.borderRadius = "14px";
                popup.style.fontSize = "18px";
                popup.style.zIndex = "10000";
                popup.style.transition = "all .25s ease";
                popup.style.pointerEvents = "none";

                document.body.appendChild(popup);
                document.body.classList.remove("modal-open");

                setTimeout(() => {
                    popup.style.transform = "translate(-50%, -50%) scale(1)";
                }, 20);

                setTimeout(() => {
                    popup.style.opacity = "0";
                    popup.style.transform = "translate(-50%, -60%) scale(0.9)";
                }, 1500);

                // (Optional safety) One-shot cleanup after chest opens
                setTimeout(killChestOverlay, 1500);

                // 🐞 DEBUG: Log the top element after chest popup (identify overlays)
                setTimeout(() => {
                    const el = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
                    console.log("TOP ELEMENT AFTER CHEST:", el);
                    console.log("ALL FIXED ELEMENTS:", Array.from(document.querySelectorAll("body *")).filter(e => {
                        const s = window.getComputedStyle(e);
                        return s.position === "fixed" && parseInt(s.zIndex || "0") > 500;
                    }));
                }, 1800);

                setTimeout(() => {
                    popup.remove();

                    // Final cleanup (hard remove overlay)
                    document.body.style.overflow = "";
                    document.body.classList.remove("modal-open");
                    killChestOverlay();

                    // Ensure board is visible again
                    const board = document.querySelector(".board");
                    if(board){
                        board.style.opacity = "1";
                    }
                }, 1500);

                burstConfetti(25);

                if(navigator.vibrate){
                    navigator.vibrate([50,30,50]);
                }

                // 🔄 Update roll badges immediately
                if(total !== undefined){
                    const rollEls = document.querySelectorAll(
                        `.rewards-available[data-child="${childId}"], .rolls-available[data-child="${childId}"], .roll-badge[data-child="${childId}"]`
                    );
                    rollEls.forEach(el => {
                        const n = total;
                        el.innerText = n === 1
                            ? "🎯 1 roll available"
                            : `🎯 ${n} rolls available`;
                        if(n === 0){
                            el.classList.add("empty");
                        } else {
                            el.classList.remove("empty");
                        }
                    });
                }

                // Ensure roll UI stays visible immediately (before refresh)
                const status = document.querySelector(`.roll-status[data-child="${childId}"]`);
                if(status){
                    if(total === 0){
                        status.classList.add("empty");
                        status.innerText = "⚠️ No more rolls — go earn another reward 🙂";
                    } else {
                        status.classList.remove("empty");
                        status.innerText = "🎲 Tap roll to play";
                    }
                }

                // Ensure no overlays block refresh
                document.body.style.pointerEvents = "auto";
                // Ensure nothing blocks navigation
                document.body.style.opacity = "1";

                // remove from DOM after animation
                setTimeout(() => {
                    el.remove();
                }, 600);
            } else {
                showToast("Error opening chest");
                document.body.style.overflow = "";
            }
        })
        .catch((err) => {
            console.error(err);
            showToast("⚠️ Network/server error");
            document.body.style.overflow = "";
        });
    }, 400);
}

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