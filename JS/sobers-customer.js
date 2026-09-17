document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector, root = document) => (root || document).querySelector(selector);
  const $$ = (selector, root = document) => [...(root || document).querySelectorAll(selector)];
  const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const KEYS = { onboarded: "sobersCustomerOnboardedV1", prefs: "sobersCustomerPrefsV1", profile: "sobersCustomerProfileV1", favourites: "sobersCustomerFavouritesV1" };
  let prefs = read(KEYS.prefs, { mood: "", promos: true, location: false });
  let profile = read(KEYS.profile, {});
  let favourites = read(KEYS.favourites, []);

  const onboarding = $("#spOnboarding");
  let step = 0;
  function showStep(index) {
    step = Math.max(0, Math.min(2, index));
    $$("[data-onboarding-step]", onboarding).forEach((item, i) => item.classList.toggle("active", i === step));
    $$(".sp-onboarding-progress i", onboarding).forEach((item, i) => item.classList.toggle("active", i <= step));
  }
  function closeOnboarding() {
    if (!onboarding) return;
    onboarding.hidden = true; onboarding.setAttribute("aria-hidden", "true"); document.body.classList.remove("sp-modal-lock");
    write(KEYS.onboarded, true); write(KEYS.prefs, prefs);
  }
  if (!window.SobersOnboardingReady && onboarding && !read(KEYS.onboarded, false)) {
    onboarding.hidden = false; onboarding.setAttribute("aria-hidden", "false"); document.body.classList.add("sp-modal-lock"); showStep(0);
  }
  if (!window.SobersOnboardingReady) $$('[data-onboarding-next]', onboarding).forEach(button => button.addEventListener("click", () => showStep(step + 1)));
  if (!window.SobersOnboardingReady) $$('[data-onboarding-skip]', onboarding).forEach(button => button.addEventListener("click", closeOnboarding));
  if (!window.SobersOnboardingReady) $$('[data-mood]', onboarding).forEach(button => button.addEventListener("click", () => { prefs.mood = button.dataset.mood; $$('[data-mood]', onboarding).forEach(item => item.classList.toggle("selected", item === button)); }));
  if (!window.SobersOnboardingReady) $('[data-onboarding-finish]', onboarding)?.addEventListener("click", () => {
    prefs.promos = $('[data-pref="promos"]', onboarding)?.checked ?? true;
    const wantsLocation = $('[data-pref="location"]', onboarding)?.checked;
    if (wantsLocation) requestLocation();
    closeOnboarding();
  });

  function openMenuFilter(filter) {
    document.querySelector(`[data-filter="${filter}"]`)?.click();
    setTimeout(() => $("#menu")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    closePanel();
  }
  $$('[data-smart-filter]').forEach(button => button.addEventListener("click", () => openMenuFilter(button.dataset.smartFilter)));

  const shell = $("#spCustomerShell");
  function openPanel(name) {
    if (!shell) return;
    shell.hidden = false; shell.setAttribute("aria-hidden", "false"); document.body.classList.add("sp-modal-lock");
    $$('[data-panel-view]', shell).forEach(view => view.classList.toggle("active", view.dataset.panelView === name));
    const titles = { rewards: "Slice Rewards", purchases: "My Purchases", account: "My Account" };
    $("#spCustomerPanelTitle").textContent = titles[name] || "My Sobers";
    $$('[data-customer-panel]').forEach(item => item.classList.toggle("active", item.dataset.customerPanel === name));
    if (name === "purchases") renderPurchases("active");
    if (name === "account") renderProfile();
  }
  function closePanel() { if (!shell) return; shell.hidden = true; shell.setAttribute("aria-hidden", "true"); document.body.classList.remove("sp-modal-lock"); }
  $$('[data-customer-panel]').forEach(button => button.addEventListener("click", () => openPanel(button.dataset.customerPanel)));
  $$('[data-customer-close]').forEach(button => button.addEventListener("click", closePanel));
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closePanel(); closeProfile(); } });

  const purchaseCopy = {
    active: ["🛵", "No active order", "Your next confirmed order will be easy to find here."],
    history: ["▤", "Your order history is clear", "Completed orders will appear here after customer accounts are connected at launch."],
    discounts: ["✦", "Fresh offers are coming", "Turn on promo updates so you do not miss genuine Sobers deals."],
  };
  function renderPurchases(tab) {
    const host = $("#spPurchaseContent"); if (!host) return;
    $$('[data-purchase-tab]').forEach(button => button.classList.toggle("active", button.dataset.purchaseTab === tab));
    if (tab === "favourites") {
      if (!favourites.length) { host.innerHTML = '<div class="sp-empty-state"><span>♡</span><h3>No favourites yet</h3><p>Tap the heart on any menu item to keep your cravings close.</p><button type="button" data-go-menu>Find a favourite</button></div>'; }
      else { host.innerHTML = `<div class="sp-favourite-list">${favourites.map(item => `<div class="sp-favourite-row"><img src="${item.image}" alt=""><div><b>${item.name}</b><small>${item.price}</small></div><button type="button" data-remove-favourite="${item.key}" aria-label="Remove ${item.name}">×</button></div>`).join("")}</div>`; }
    } else {
      const copy = purchaseCopy[tab] || purchaseCopy.active;
      host.innerHTML = `<div class="sp-empty-state"><span>${copy[0]}</span><h3>${copy[1]}</h3><p>${copy[2]}</p><button type="button" data-go-menu>Browse menu</button></div>`;
    }
  }
  $$('[data-purchase-tab]').forEach(button => button.addEventListener("click", () => renderPurchases(button.dataset.purchaseTab)));
  $("#spPurchaseContent")?.addEventListener("click", event => {
    if (event.target.closest('[data-go-menu]')) { closePanel(); $("#menu")?.scrollIntoView({ behavior: "smooth" }); }
    const remove = event.target.closest('[data-remove-favourite]');
    if (remove) { favourites = favourites.filter(item => item.key !== remove.dataset.removeFavourite); write(KEYS.favourites, favourites); renderPurchases("favourites"); refreshHearts(); }
  });

  function injectHearts() {
    $$('.sp-menu-card').forEach(card => {
      if ($('.sp-favourite', card)) return;
      const orderButton = $('[data-product]', card); const image = $('.sp-menu-image img', card); const title = $('h3', card); const price = $('footer strong', card);
      if (!orderButton || !image || !title) return;
      const heart = document.createElement('button'); heart.type = 'button'; heart.className = 'sp-favourite'; heart.dataset.favouriteKey = orderButton.dataset.product; heart.setAttribute('aria-label', `Save ${title.textContent.trim()} to favourites`); heart.textContent = '♡';
      heart.dataset.name = title.textContent.trim(); heart.dataset.image = image.getAttribute('src'); heart.dataset.price = price?.textContent.trim() || '';
      $('.sp-menu-image', card).appendChild(heart);
    });
    refreshHearts();
  }
  function refreshHearts() { $$('[data-favourite-key]').forEach(button => { const saved = favourites.some(item => item.key === button.dataset.favouriteKey); const symbol = saved ? '♥' : '♡'; button.classList.toggle('saved', saved); if (button.textContent !== symbol) button.textContent = symbol; }); }
  $("#spMenuGrid")?.addEventListener("click", event => {
    const button = event.target.closest('[data-favourite-key]'); if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const item = { key: button.dataset.favouriteKey, name: button.dataset.name, image: button.dataset.image, price: button.dataset.price };
    const exists = favourites.some(entry => entry.key === item.key); favourites = exists ? favourites.filter(entry => entry.key !== item.key) : [...favourites, item]; write(KEYS.favourites, favourites); refreshHearts();
  }, true);
  const menuObserver = new MutationObserver(injectHearts); if ($("#spMenuGrid")) menuObserver.observe($("#spMenuGrid"), { childList: true, subtree: true }); setTimeout(injectHearts, 200);

  $('[data-surprise-me]')?.addEventListener("click", () => { const choices = ['pizza','shawarma','loaded-fries','promo-packs']; openMenuFilter(choices[Math.floor(Math.random() * choices.length)]); });
  $('[data-account-theme]')?.addEventListener("click", () => $("#spThemeButton")?.click());
  $('[data-notification-preference]')?.addEventListener("click", async () => {
    if (!("Notification" in window)) return alert("Notifications are not supported on this device.");
    const result = await Notification.requestPermission(); prefs.promos = result === "granted"; write(KEYS.prefs, prefs);
  });
  function requestLocation() {
    if (!navigator.geolocation) return alert("Location is not supported on this device.");
    const status = $("#spLocationStatus"); if (status) status.textContent = "Checking permission…";
    navigator.geolocation.getCurrentPosition(position => { prefs.location = true; prefs.coords = { lat: position.coords.latitude, lng: position.coords.longitude }; write(KEYS.prefs, prefs); if (status) status.textContent = "On — used only for delivery"; }, () => { prefs.location = false; write(KEYS.prefs, prefs); if (status) status.textContent = "Off — optional"; }, { enableHighAccuracy: false, timeout: 8000 });
  }
  $('[data-location-preference]')?.addEventListener("click", requestLocation);

  const profileDialog = $("#spProfileDialog");
  function openProfile() { if (!profileDialog) return; profileDialog.hidden = false; profileDialog.setAttribute("aria-hidden", "false"); const form = $('form', profileDialog); form.name.value = profile.name || ''; form.phone.value = profile.phone || ''; form.address.value = profile.address || ''; }
  function closeProfile() { if (!profileDialog) return; profileDialog.hidden = true; profileDialog.setAttribute("aria-hidden", "true"); }
  function renderProfile() { const name = $("#spCustomerName"); if (name) name.textContent = profile.name ? `Hi, ${profile.name.split(' ')[0]}` : "Welcome, pizza lover"; const status = $("#spLocationStatus"); if (status) status.textContent = prefs.location ? "On — used only for delivery" : "Off — optional"; }
  $('[data-profile-edit]')?.addEventListener("click", openProfile); $('[data-profile-close]')?.addEventListener("click", closeProfile);
  $('.sp-profile-card')?.addEventListener("submit", event => { event.preventDefault(); const data = new FormData(event.currentTarget); profile = { name: String(data.get('name') || '').trim(), phone: String(data.get('phone') || '').trim(), address: String(data.get('address') || '').trim() }; write(KEYS.profile, profile); renderProfile(); closeProfile(); const checkout = $("#spCheckoutForm"); if (checkout) { if (checkout.elements.name && !checkout.elements.name.value) checkout.elements.name.value = profile.name; if (checkout.elements.phone && !checkout.elements.phone.value) checkout.elements.phone.value = profile.phone; if (checkout.elements.address && !checkout.elements.address.value) checkout.elements.address.value = profile.address; } });
  $$('[data-open-legal="terms"]').forEach(button => button.addEventListener("click", () => { window.location.href = "legal/terms.html"; }));
  $$('[data-open-legal="privacy"]').forEach(button => button.addEventListener("click", () => { window.location.href = "legal/privacy.html"; }));
  renderProfile();
});
