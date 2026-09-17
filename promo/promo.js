(() => {
  "use strict";

  const stage = document.querySelector("#promoStage");
  const replayButton = document.querySelector("#replayPromo");
  const audio = document.querySelector("#promoAudio");
  const duration = 15000;
  let completionTimer;

  function setSceneAccessibility(isPlaying) {
    stage.querySelectorAll(".scene").forEach(scene => scene.setAttribute("aria-hidden", String(!isPlaying)));
  }

  function playPromo() {
    clearTimeout(completionTimer);
    stage.classList.remove("is-playing");
    void stage.offsetWidth;
    stage.classList.add("is-playing");
    setSceneAccessibility(true);
    replayButton.textContent = "Playing…";
    replayButton.disabled = true;

    // Audio remains opt-in. If promo-audio.mp3 is added later, start it only after
    // the user presses Replay; browsers should never receive unsolicited sound.
    if (audio.getAttribute("src") && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }

    completionTimer = window.setTimeout(() => {
      replayButton.innerHTML = "<span>↻</span> Replay 15-second advert";
      replayButton.disabled = false;
      setSceneAccessibility(false);
    }, duration);
  }

  replayButton.addEventListener("click", playPromo);
  window.addEventListener("load", playPromo, { once: true });
})();
