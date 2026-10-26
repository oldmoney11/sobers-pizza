(() => {
  "use strict";
  let map = null;
  let marker = null;
  let trail = null;

  function mapsLink() {
    return document.querySelector("#openMaps");
  }

  function hide() {
    const card = document.querySelector("#deliveryMapCard");
    if (card) card.classList.add("is-idle");
    const empty = document.querySelector("#mapEmpty");
    const canvas = document.querySelector("#deliveryMap");
    const button = document.querySelector("#recenter");
    const link = mapsLink();
    const title = document.querySelector("#mapTitle");
    const note = document.querySelector("#mapFreshness");
    if (title) title.textContent = "Map opens on the way";
    if (empty) {
      empty.hidden = false;
      empty.textContent = "The live map appears when your rider starts this delivery.";
    }
    if (canvas) canvas.hidden = true;
    if (button) button.hidden = true;
    if (link) link.hidden = true;
    if (note) note.textContent = "No arrival time is shown. The map opens when the rider starts.";
    if (map) {
      map.remove();
      map = null;
      marker = null;
      trail = null;
    }
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
    const link = mapsLink();
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
      if (link) link.hidden = true;
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
      ? `${fresh}. The phone may be out of signal.`
      : `${fresh}. The red line is where the rider has moved since you opened this page.`;
    if (wayFresh) wayFresh.textContent = fresh;
    if (empty) empty.hidden = true;
    if (canvas) canvas.hidden = false;
    if (button) button.hidden = false;
    if (link) {
      link.hidden = false;
      link.href = `https://www.google.com/maps?q=${encodeURIComponent(point.latitude)},${encodeURIComponent(point.longitude)}`;
    }
    if (!window.L) return;
    const latlng = [Number(point.latitude), Number(point.longitude)];
    if (!map) {
      map = window.L.map("deliveryMap", { zoomControl: true, attributionControl: true }).setView(latlng, 16);
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(map);
      trail = window.L.polyline([latlng], { color: "#ef233c", weight: 4, opacity: 0.9 }).addTo(map);
      marker = window.L.circleMarker(latlng, {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: "#ef233c",
        fillOpacity: 1
      }).addTo(map);
      marker.bindTooltip("Rider", { permanent: false, direction: "top" });
    } else {
      const last = marker.getLatLng();
      if (trail && (Math.abs(last.lat - latlng[0]) > 0.00002 || Math.abs(last.lng - latlng[1]) > 0.00002)) trail.addLatLng(latlng);
      marker.setLatLng(latlng);
      map.panTo(latlng);
    }
    window.setTimeout(() => map.invalidateSize(), 80);
  }

  const button = document.querySelector("#recenter");
  if (button) button.addEventListener("click", recenter);
  window.SobersDeliveryMap = { show, hide, recenter };
})();
