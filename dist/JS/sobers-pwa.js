"use strict";
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js?v=75")
      .then((registration) => {
        registration.update();
        console.log("Sobers Pizza service worker registered:", registration.scope);
      })
      .catch((error) => {
        console.error("Sobers Pizza service worker registration failed:", error);
      });
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "PWA_UPDATED" || sessionStorage.getItem("sobers-pwa-v66")) {
      return;
    }
    sessionStorage.setItem("sobers-pwa-v66", "1");
    location.reload();
  });
}

// Install App prompt
let deferredPrompt = null;
const installBtn = document.getElementById("spInstallApp");

if (installBtn) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      // iOS or unsupported
      alert("To install Sobers Pizza:\n\n• Android: Open the browser menu and choose “Add to Home screen” or “Install app”.\n• iPhone: Tap the Share button, then “Add to Home Screen”.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      installBtn.hidden = true;
    }
    deferredPrompt = null;
  });

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    deferredPrompt = null;
  });

  // Hide if already installed
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    installBtn.hidden = true;
  }
}
