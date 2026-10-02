(() => {
  let deferredInstall = null;
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing) return; refreshing = true; location.reload(); });
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=16").then(r => r.update()).catch(console.error));
  }
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstall = event; mountInstall(); });
  function mountInstall() {
    const topbar = document.querySelector(".topbar"); const host = document.querySelector(".login-card:not(.hidden)") || topbar; if (!host || document.querySelector("[data-install-admin]")) return;
    const button = document.createElement("button"); button.type="button"; button.className="secondary"; button.dataset.installAdmin=""; button.textContent="Install app";
    button.onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;button.remove();}; if (host === topbar) topbar.insertBefore(button,document.querySelector("#signOut")); else host.appendChild(button);
  }
})();
