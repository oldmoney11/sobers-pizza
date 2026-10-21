(() => {
  "use strict";
  let map = null;
  let marker = null;

  function hide() {
    const card = document.querySelector("#deliveryMapCard");
    if (card) card.classList.add("is-idle");
    const empty = document.querySelector("#mapEmpty");
    const canvas = document.querySelector("#deliveryMap");
    const button = document.querySelector("#recenter");
    const title = document.querySelector("#mapTitle");
    const note = document.querySelector("#mapFreshness");
    if (title) title.textContent = "Map opens on the way";
    if (empty) {
      empty.hidden = false;
      empty.textContent = "The live map appears when your rider starts this delivery.";
    }
    if (canvas) canvas.hidden = true;
    if (button) button.hidden = true;
    if (note) note.textContent = "No route or arrival time is shown. Only a real location point.";
  }

  function recenter() {
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
  }

  function show(point) {
    const card = document.querySelector("#deliveryMapCard");
    const note = document.querySelector("#mapFreshness");
    const empty = document.querySelector("#mapEmpty");
    const canvas = document.querySelector("#deliveryMap");
    const button = document.querySelector("#recenter");
    const title = document.querySelector("#mapTitle");
    const wayFresh = document.querySelector("#wayFresh");
    if (!card || !note) return;
    card.classList.remove("is-idle");
    if (!point || point.latitude == null || point.longitude == null) {
      if (title) title.textContent = "Waiting for location";
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Waiting for rider location…";
      }
      if (canvas) canvas.hidden = true;
      if (button) button.hidden = true;
      note.textContent = "Your rider’s location is currently unavailable.";
      if (wayFresh) wayFresh.textContent = "Waiting for rider location…";
      return;
    }
    const age = Math.max(0, Math.round((Date.now() - Date.parse(point.updated_at)) / 1000));
    const fresh = age > 90
      ? `Last location ${Math.max(1, Math.round(age / 60))} min ago`
      : `Updated ${age}s ago`;
    if (title) title.textContent = "Live location";
    note.textContent = age > 90
      ? `${fresh}. The phone may be out of signal. This is a point, not a route.`
      : `${fresh}. This is the rider’s latest point, not a road route.`;
    if (wayFresh) wayFresh.textContent = fresh;
    if (empty) empty.hidden = true;
    if (canvas) canvas.hidden = false;
    if (button) button.hidden = false;
    if (!window.L) return;
    const latlng = [Number(point.latitude), Number(point.longitude)];
    if (!map) {
      map = window.L.map("deliveryMap", { zoomControl: true, attributionControl: true }).setView(latlng, 16);
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap &copy; CARTO"
      }).addTo(map);
      marker = window.L.circleMarker(latlng, {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: "#ef233c",
        fillOpacity: 1
      }).addTo(map);
      marker.bindTooltip("Rider", { permanent: false, direction: "top" });
    } else {
      marker.setLatLng(latlng);
      map.panTo(latlng);
    }
    window.setTimeout(() => map.invalidateSize(), 80);
  }

  const button = document.querySelector("#recenter");
  if (button) button.addEventListener("click", recenter);
  window.SobersDeliveryMap = { show, hide, recenter };
})();
