"use strict";
if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=11").then(registration => registration.update()).catch(console.error));
      }
