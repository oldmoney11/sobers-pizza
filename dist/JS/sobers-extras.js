(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById("spThemeButton");
  const themeIcon = themeButton?.querySelector(".sp-theme-icon");
  let preferenceStorage = null;
  try {
    preferenceStorage = window.localStorage || null;
  } catch (_) {
    preferenceStorage = null;
  }
  const designVersion = "premium-urban-v1";
  const hasCurrentDesign = preferenceStorage?.getItem("sobers_design") === designVersion;
  const savedTheme = hasCurrentDesign ? preferenceStorage?.getItem("sobers_theme") || null : null;
  const preferredTheme = "dark";

  if (!hasCurrentDesign) {
    preferenceStorage?.setItem("sobers_design", designVersion);
    preferenceStorage?.removeItem("sobers_theme");
  }

  function applyTheme(theme, remember = false) {
    root.dataset.spTheme = theme;
    if (themeIcon) themeIcon.textContent = theme === "light" ? "☾" : "☀";
    if (themeButton)
      themeButton.setAttribute(
        "aria-label",
        `Switch to ${theme === "light" ? "dark" : "light"} theme`,
      );
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "light" ? "#f7f1e8" : "#10131a";
    if (remember) preferenceStorage?.setItem("sobers_theme", theme);
  }

  applyTheme(savedTheme || preferredTheme);
  themeButton?.addEventListener("click", () =>
    applyTheme(root.dataset.spTheme === "light" ? "dark" : "light", true),
  );

  if (!savedTheme) {
    const preference = window.matchMedia("(prefers-color-scheme: light)");
    preference.addEventListener?.("change", (event) =>
      applyTheme(event.matches ? "light" : "dark"),
    );
  }

  const overlay = document.getElementById("spQrOverlay");
  const qrButton = document.getElementById("spQrButton");
  const qrClose = document.getElementById("spQrClose");
  const qrImage = document.getElementById("spQrImage");
  const qrNote = document.getElementById("spQrNote");
  const shareButton = document.getElementById("spQrShare");
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const appUrl = `${location.origin}${location.pathname}`;
  const qrUrl = `https://quickchart.io/qr?size=420&margin=2&dark=11131a&light=fffaf1&text=${encodeURIComponent(appUrl)}`;

  function openQr() {
    if (qrImage && !qrImage.src) qrImage.src = qrUrl;
    if (qrNote)
      qrNote.textContent = isLocal
        ? "Preview only: generate the printable QR again after the public domain is connected."
        : "This QR opens the live Sobers customer ordering app.";
    overlay?.classList.add("active");
    overlay?.setAttribute("aria-hidden", "false");
    document.body.classList.add("sp-modal-open");
    qrClose?.focus();
  }

  function closeQr() {
    overlay?.classList.remove("active");
    overlay?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sp-modal-open");
    qrButton?.focus();
  }

  qrButton?.addEventListener("click", openQr);
  qrClose?.addEventListener("click", closeQr);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeQr();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay?.classList.contains("active")) closeQr();
  });

  shareButton?.addEventListener("click", async () => {
    const shareData = {
      title: "Sobers Pizza",
      text: "Open the Sobers Pizza menu and order here.",
      url: appUrl,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(appUrl);
        shareButton.textContent = "Link copied";
        window.setTimeout(() => {
          shareButton.textContent = "Share ordering link";
        }, 1800);
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("Sobers share was not completed.");
    }
  });

  if (new URLSearchParams(location.search).get("qr") === "1") openQr();
})();
