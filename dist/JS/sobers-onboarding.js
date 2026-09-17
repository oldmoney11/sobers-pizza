(function () {
  "use strict";
  const root = document.getElementById("spOnboarding");
  if (!root) return;
  window.SobersOnboardingReady = true;
  const key = "sobersCustomerOnboardedV1";
  const prefKey = "sobersCustomerPrefsV1";
  const steps = [...root.querySelectorAll("[data-onboarding-step]")];
  const dots = [...root.querySelectorAll(".sp-onboarding-progress i")];
  let step = 0;
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(prefKey) || "{}") || {}; } catch (_) {}

  function show(index) {
    step = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach((item, position) => item.classList.toggle("active", position === step));
    dots.forEach((item, position) => item.classList.toggle("active", position <= step));
  }
  function close() {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sp-modal-lock");
    try { localStorage.setItem(key, "true"); localStorage.setItem(prefKey, JSON.stringify(prefs)); } catch (_) {}
  }
  function open() {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("sp-modal-lock");
    show(0);
  }

  let lastPointerHandled = 0;
  root.addEventListener("pointerup", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.matches("[data-onboarding-skip]")) { event.preventDefault(); lastPointerHandled = Date.now(); close(); return; }
    if (button.matches("[data-onboarding-next]")) { event.preventDefault(); lastPointerHandled = Date.now(); show(step + 1); return; }
    if (button.matches("[data-mood]")) {
      prefs.mood = button.dataset.mood;
      root.querySelectorAll("[data-mood]").forEach(item => item.classList.toggle("selected", item === button));
      return;
    }
    if (button.matches("[data-onboarding-finish]")) {
      event.preventDefault(); lastPointerHandled = Date.now();
      prefs.promos = root.querySelector('[data-pref="promos"]')?.checked !== false;
      prefs.location = root.querySelector('[data-pref="location"]')?.checked === true;
      close();
    }
  });
  root.addEventListener("click", event => {
    if (Date.now() - lastPointerHandled < 500) return;
    const button = event.target.closest("button");
    if (button?.matches("[data-onboarding-skip]")) close();
    else if (button?.matches("[data-onboarding-next]")) show(step + 1);
    else if (button?.matches("[data-onboarding-finish]")) close();
  });

  let completed = false;
  try { completed = JSON.parse(localStorage.getItem(key) || "false") === true; } catch (_) {}
  if (completed) close(); else open();
})();
