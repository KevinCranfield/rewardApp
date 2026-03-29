// 🐍 Snakes & 🪜 Ladders
const snakes = {
    62: 44,  // top-left snake
    55: 41,  // right-side snake
    27: 10,    // bottom snake
    33: 18,
};

const ladders = {
    3: 22,   // bottom-left
    8: 26,   // right side lower
    19: 38,  // mid board
    35: 49,   // upper climb
};

// 🔊 SOUND SYSTEM
const sounds = {
    dice: new Audio('/static/game/sounds/dice.mp3'),
    win: new Audio('/static/game/sounds/win.mp3'),
    click: new Audio('/static/game/sounds/click.mp3')
};

function playSound(name){
    if(sounds[name]){
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

    const button = document.querySelector(`button[onclick*="${childId}"]`);

    // 🚫 prevent double clicks
    if(button && button.disabled) return;
    if(button) button.disabled = true;
    playSound('click');

    // Store button reference on token
    const token = document.getElementById("token-" + childId);
    if(token){
        token._rollButton = button;
    }

    let current = 0;

    // 🔍 find current position from token
    // token already defined above
    if(token){
        const square = token.closest(".square");
        if(square){
            current = parseInt(square.dataset.square);
        }
    } else {
        console.error("Token not found!");
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
            alert(data.error);
            if(button) button.disabled = false;
            return;
        }

        console.log("ROLL:", data);

        showDice(data.dice);
        if(data.children){
            updateTokensUI(data.children);
        }

        // 🚨 fallback if movement fails
        if(!data.position || data.position <= current){
            console.warn("No movement detected");
            if(button) button.disabled = false;
            return;
        }

        setTimeout(() => {
            animateMovement(childId, current, data.position);
        }, 400);

    })
    .catch(err => {
        console.error(err);
        if(button) button.disabled = false;
    });
}

function animateMovement(childId, start, end){

    let token = document.getElementById("token-" + childId);
    // 🆕 CREATE TOKEN if not on board yet
    if(!token){
        token = document.createElement("div");
        token.className = "token";
        token.id = "token-" + childId;

        // 👇 optional: show initial letter
        token.textContent = "•";

        // 👇 you can improve later with colour
    }

    let step = start === 0 ? 1 : start + 1;

    // Add optional easing for smoother movement
    const ease = t => t*t*(3 - 2*t);
    function move(){
        if(step > end){

            // 🎯 WIN CHECK
            if(end === 64){
                const token = document.getElementById("token-" + childId);
                if(token){
                    token.classList.add("winner");
                }

                // 🎉 celebration
                playSound('win');
                burstConfetti(80);

                // 🎁 random bonus
                if(Math.random() < 0.3){
                    showToast("🎁 BONUS! Extra reward!");
                }

                console.log("🏆 WINNER!", childId);
                return;
            }

            // 🎯 check snakes or ladders AFTER movement
            let finalPos = end;

            if(snakes[finalPos]){
                console.log("🐍 Snake!", finalPos, "→", snakes[finalPos]);
                return animateJump(childId, finalPos, snakes[finalPos]);
            }

            if(ladders[finalPos]){
                console.log("🪜 Ladder!", finalPos, "→", ladders[finalPos]);
                return animateJump(childId, finalPos, ladders[finalPos]);
            }

            // Re-enable roll button for this token
            if(token && token._rollButton){
                token._rollButton.disabled = false;
            }
            if(window.__lastChildren){
                updateTokensUI(window.__lastChildren);
            }

            return; // no reload, stay on board
        }

        const square = document.querySelector(
            `[data-square='${step}'] .token-container`
        );

        if(square){
            square.appendChild(token);
        }

        step++;
        setTimeout(move, 220);
    }

    move();
}

function updateTokensUI(children){

    // 🧹 remove all tokens
    document.querySelectorAll(".token").forEach(t => t.remove());

    // 🔁 rebuild from backend state
    children.forEach(child => {

        const container = document.querySelector(
            `[data-square='${child.position}'] .token-container`
        );

        if(!container) return;

        const token = document.createElement("div");
        token.className = "token";
        token.id = "token-" + child.id;
        token.textContent = "•";

        if(child.colour){
            token.style.background = child.colour;
        }

        container.appendChild(token);
    });
}

function animateJump(childId, start, end){

    const token = document.getElementById("token-" + childId);

    const p1 = getSquareCenter(start);
    const p2 = getSquareCenter(end);

    if(!p1 || !p2) return;

    const duration = 700;
    const startTime = performance.now();
    const ease = t => t*t*(3 - 2*t);

    const isLadder = end > start;

    function animate(time){
        const progressRaw = Math.min((time - startTime) / duration, 1);
        const progress = ease(progressRaw);

        let x, y;

        if(isLadder){
            // straight line climb
            x = p1.x + (p2.x - p1.x) * progress;
            y = p1.y + (p2.y - p1.y) * progress;
        } else {
            // curved snake slide
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            const curveOffset = (p2.x > p1.x ? 1 : -1) * 60;

            const cx = midX + curveOffset;
            const cy = midY;

            // quadratic bezier
            const t = progress;
            const inv = 1 - t;

            x = inv*inv*p1.x + 2*inv*t*cx + t*t*p2.x;
            y = inv*inv*p1.y + 2*inv*t*cy + t*t*p2.y;
        }

        token.style.position = "absolute";
        token.style.left = (x - 14) + "px";
        token.style.top = (y - 14) + "px";
        token.style.transform = `rotate(${(progress - 0.5) * 20}deg)`;

        if(progress < 1){
            requestAnimationFrame(animate);
        } else {
            // snap into square container
            const targetSquare = document.querySelector(
                `[data-square='${end}'] .token-container`
            );

            if(targetSquare){
                token.style.position = "";
                token.style.left = "";
                token.style.top = "";
                targetSquare.appendChild(token);
                token.style.transform = "";
            }

            // win check
            if(end === 64){
                token.classList.add("winner");

                playSound('win');
                burstConfetti(80);

                if(Math.random() < 0.3){
                    showToast("🎁 BONUS! Extra reward!");
                }

                console.log("🏆 WINNER via jump!", childId);
            }

            // Re-enable roll button for this token
            if(token && token._rollButton){
                token._rollButton.disabled = false;
            }
            if(window.__lastChildren){
                updateTokensUI(window.__lastChildren);
            }
        }
    }

    requestAnimationFrame(animate);
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

    // 🪜 Draw ladders (premium)
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

        // rails
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

        // rungs
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

            // ensure visible even if CSS fails
            rung.setAttribute("stroke", "url(#ladderRung)");
            rung.setAttribute("stroke-width", "3");
            rung.setAttribute("stroke-linecap", "round");

            rung.setAttribute("class", "ladder-rung");
            svg.appendChild(rung);
        }
    }

    // 🐍 Draw snakes (curved)
    for(const start in snakes){
        const end = snakes[start];

        const p1 = getSquareCenter(start);
        const p2 = getSquareCenter(end);

        if(!p1 || !p2) continue;

        const gradId = `snake-grad-${start}`;

        const defs = svg.querySelector("defs") || document.createElementNS("http://www.w3.org/2000/svg", "defs");
        if(!svg.querySelector("defs")) svg.appendChild(defs);

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
        defs.appendChild(gradient);

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // smooth sideways curve
        let direction = (p2.x > p1.x ? 1 : -1);
        if(Math.abs(p1.x - p2.x) < 20){
            direction = Math.random() > 0.5 ? 1 : -1;
        }

        const curveOffset = direction * 60;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx*dx + dy*dy);

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        const d = `M ${p1.x} ${p1.y} Q ${midX + curveOffset} ${midY} ${p2.x} ${p2.y}`;

        // OUTLINE (gives thickness + premium look)
        const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
        outline.setAttribute("d", d);
        outline.setAttribute("stroke", "#065f46");
        outline.setAttribute("stroke-width", "8");
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke-linecap", "round");
        outline.setAttribute("opacity", "0.6");
        svg.appendChild(outline);

        // MAIN BODY
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", `url(#${gradId})`);
        path.setAttribute("stroke-width", "4");
        path.setAttribute("class", "snake-body");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");

        svg.appendChild(path);

        // HEAD
        const head = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        head.setAttribute("cx", p1.x);
        head.setAttribute("cy", p1.y);
        head.setAttribute("r", "8");
        head.setAttribute("fill", "#166534");
        svg.appendChild(head);

        // EYES (direction-aware)
        const eyeOffsetForward = 3; // forward along path
        const eyeOffsetSide = 2;    // side offset

        const fx = Math.cos(angle);
        const fy = Math.sin(angle);

        const sx = -fy; // perpendicular
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

        // Forked tongue: two prongs, slightly curved
        const baseX = p1.x + fx * 6;
        const baseY = p1.y + fy * 6;
        const tLen = 6;
        const spread = 2.2; // how far prongs split

        // prong 1 (slight curve to one side)
        const prong1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const c1x = baseX + fx * (tLen * 0.5) + sx * spread; // control point
        const c1y = baseY + fy * (tLen * 0.5) + sy * spread;
        const e1x = baseX + fx * tLen + sx * (spread * 1.2);   // end point
        const e1y = baseY + fy * tLen + sy * (spread * 1.2);
        prong1.setAttribute("d", `M ${baseX} ${baseY} Q ${c1x} ${c1y} ${e1x} ${e1y}`);
        prong1.setAttribute("stroke", "#ef4444");
        prong1.setAttribute("stroke-width", "1.5");
        prong1.setAttribute("fill", "none");
        prong1.setAttribute("stroke-linecap", "round");
        prong1.setAttribute("class", "snake-tongue");
        svg.appendChild(prong1);

        // prong 2 (mirror curve to other side)
        const prong2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const c2x = baseX + fx * (tLen * 0.5) - sx * spread;
        const c2y = baseY + fy * (tLen * 0.5) - sy * spread;
        const e2x = baseX + fx * tLen - sx * (spread * 1.2);
        const e2y = baseY + fy * tLen - sy * (spread * 1.2);
        prong2.setAttribute("d", `M ${baseX} ${baseY} Q ${c2x} ${c2y} ${e2x} ${e2y}`);
        prong2.setAttribute("stroke", "#ef4444");
        prong2.setAttribute("stroke-width", "1.5");
        prong2.setAttribute("fill", "none");
        prong2.setAttribute("stroke-linecap", "round");
        prong2.setAttribute("class", "snake-tongue");
        svg.appendChild(prong2);

        // EYES
        // const eye1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        // eye1.setAttribute("cx", p1.x - 2);
        // eye1.setAttribute("cy", p1.y - 2);
        // eye1.setAttribute("r", "1.2");
        // eye1.setAttribute("fill", "white");

        // const eye2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        // eye2.setAttribute("cx", p1.x + 2);
        // eye2.setAttribute("cy", p1.y - 2);
        // eye2.setAttribute("r", "1.2");
        // eye2.setAttribute("fill", "white");

        const tail = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        tail.setAttribute("cx", p2.x);
        tail.setAttribute("cy", p2.y);
        tail.setAttribute("r", "2");
        tail.setAttribute("fill", "#14532d");
        svg.appendChild(tail);
    }
}

function showDice(value){

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

    dice.textContent = "🎲 " + value;

    playSound('dice');

    dice.style.transition = "all .2s ease";
    dice.style.transform = "translate(-50%, -50%) scale(1)";

    setTimeout(() => {
        dice.style.transform = "translate(-50%, -50%) scale(0)";
    }, 1400);
}

// 🔐 CSRF helper
function getCSRFToken() {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith('csrftoken'))
        ?.split('=')[1]
}

function toggleAddChild(){
    const form = document.getElementById("addChildForm")
    form.classList.toggle("hidden")
}

// 🔒 Toggle PIN section UI
function togglePinSection(){
    const section = document.getElementById("pinSection");
    const btn = document.querySelector("button[onclick='togglePinSection()']");

    section.classList.toggle("hidden");

    if(btn){
        btn.innerText = section.classList.contains("hidden")
            ? "🔐 Change PIN"
            : "❌ Close PIN";
    }
}

// 🛡️ Numeric-only PIN input enforcement
window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("input[name='new_pin'], input[name='confirm_pin']")
        .forEach(input => {
            input.addEventListener("input", () => {
                input.value = input.value.replace(/[^0-9]/g, "");
            });
        });
});

// ✨ Clear PIN fields after successful submit
function clearPinFields(){
    document.querySelectorAll("input[name='new_pin'], input[name='confirm_pin']")
        .forEach(input => input.value = "");
}

// Hook into PIN form submit success
window.addEventListener("submit", function(e){
    if(e.target.classList && e.target.classList.contains("pin-form")){
        setTimeout(clearPinFields, 500);
    }
});

const style = document.createElement("style");
style.innerHTML = `
@keyframes tongueFlick {
    0%, 80%, 100% { opacity: 0; }
    85% { opacity: 1; }
}

.snake-body {
    animation: snakeGlow 3s ease-in-out infinite;
}

.snake-tongue {
    animation: tongueFlick 2.5s ease-in-out infinite;
}

@keyframes snakeGlow {
    0%, 100% { filter: drop-shadow(0 1px 2px rgba(0,0,0,.2)); }
    50% { filter: drop-shadow(0 3px 6px rgba(34,197,94,.4)); }
}

/* 🎉 Confetti */
.confetti-piece{
    position: fixed;
    width: 8px;
    height: 12px;
    opacity: 0.9;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 9999;
    animation: confettiFall 1200ms ease-out forwards;
}

@keyframes confettiFall{
    0%{
        transform: translate(-50%, -50%) rotate(0deg);
        opacity: 1;
    }
    100%{
        transform: translate(var(--dx), var(--dy)) rotate(360deg);
        opacity: 0;
    }
}
`;
document.head.appendChild(style);

function burstConfetti(count = 40){
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];

    for(let i=0;i<count;i++){
        const el = document.createElement("div");
        el.className = "confetti-piece";

        el.style.background = colors[Math.floor(Math.random()*colors.length)];

        const angle = Math.random() * Math.PI * 2;
        const distance = 80 + Math.random()*140;

        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance + 120;

        el.style.setProperty("--dx", dx + "px");
        el.style.setProperty("--dy", dy + "px");

        el.style.animationDelay = (Math.random()*0.15) + "s";

        document.body.appendChild(el);

        setTimeout(()=> el.remove(), 1400);
    }
}

window.addEventListener("load", () => {
    drawConnections();
    window.addEventListener("resize", drawConnections);
});

if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/static/game/js/sw.js")
        .then(() => console.log("✅ Service Worker registered"))
        .catch(err => console.log("SW error", err));
}


// 🔐 Smart inactivity ping (keeps PIN session alive while active)
function pingActivity(){
    fetch("/ping-auth/", {
        method: "POST",
        headers: {
            "X-CSRFToken": getCSRFToken()
        }
    }).catch(()=>{});
}

document.getElementById("resetBoardBtn")?.addEventListener("click", () => {

    const confirmReset = confirm("⚠️ Reset the board for all players?");
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

            // 🧹 remove all tokens
            document.querySelectorAll(".token").forEach(t => t.remove());

            // 🔢 reset UI values
            document.querySelectorAll(".position").forEach(el => {
                el.innerText = "Position: 0";
            });

            document.querySelectorAll(".progress-bar-fill").forEach(bar => {
                bar.style.width = "0%";
            });

            // ❗ reset last roll
            document.querySelectorAll(".last-roll").forEach(el => {
                el.innerText = "-";
            });

            // 🎯 reset rewards available text
            document.querySelectorAll(".rewards-available").forEach(el => {
                el.innerText = "Rewards Available: 0";
            });

            // 🧼 clear recent reward history UI (keep DB intact)
            document.querySelectorAll(".reward-history").forEach(el => {
                el.innerHTML = "";
            });

        }
    });
});


let activityTimeout;

function resetActivityTimer(){
    clearTimeout(activityTimeout);

    // debounce ping (avoid spamming server)
    activityTimeout = setTimeout(pingActivity, 2000);
}

["click", "keydown", "touchstart"].forEach(evt => {
    document.addEventListener(evt, resetActivityTimer);
});

// initial activity
resetActivityTimer();