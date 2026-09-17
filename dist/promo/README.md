# Sobers Pizza 15-second promo experiment

This folder is deliberately independent from the customer app, kiosk, admin dashboard and ordering code.

## Timing

- 0–3 seconds: hook
- 3–7 seconds: product reveal
- 7–11 seconds: craving moment
- 11–15 seconds: brand and call to action

## Optional audio

Place a licensed audio file named `promo-audio.mp3` in this folder and add `src="promo-audio.mp3"` to the `audio` element in `index.html`. Audio is intentionally never autoplayed. If sound is enabled later, it should begin only following a user interaction.
