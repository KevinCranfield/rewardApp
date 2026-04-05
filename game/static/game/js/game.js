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

            // Clear board visuals
            document.querySelectorAll(".token").forEach(t => t.remove());
            document.querySelectorAll(".progress-bar-fill").forEach(bar => bar.style.width = "0%");
            document.querySelectorAll(".last-roll").forEach(el => el.innerText = "-");
            document.querySelectorAll(".rewards-available").forEach(el => el.innerText = "Rewards Available: 0");
            document.querySelectorAll(".reward-history").forEach(el => el.innerHTML = "");

            // 🔄 Update dashboard cards instantly (no refresh needed)
            if(data.children){
                data.children.forEach(child => {
                    const card = document.querySelector(`.card[data-child-id="${child.id}"]`);
                    if(!card) return;

                    // Update position
                    const posEl = card.querySelector(".child-position");
                    if(posEl) posEl.innerText = `Position: ${child.position}`;

                    // Update rolls
                    const rollsEl = card.querySelector("[data-rolls]");
                    if(rollsEl) rollsEl.innerText = `Rolls added: ${child.rolls_available ?? 0}`;
                });
            }
        }
    });
});