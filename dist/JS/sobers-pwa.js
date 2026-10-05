"use strict";
if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker
            .register("./sw.js?v=73")
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
