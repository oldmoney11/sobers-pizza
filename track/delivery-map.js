(() => {
  "use strict";
  let map = null;
  let marker = null;

  function hide() {
    const card = document.querySelector("#deliveryMapCard");
    if (card) card.classList.add("hidden");
  }

  function show(point) {
    const card = document.querySelector("#deliveryMapCard");
    const note = document.querySelector("#mapFreshness");
    if (!card || !note) return;
    card.classList.remove("hidden");
    if (!point || point.latitude == null || point.longitude == null) {
      note.textContent = "Waiting for the rider’s phone to share a location.";
      return;
    }
    const age = Math.max(0, Math.round((Date.now() - Date.parse(point.updated_at)) / 1000));
    note.textContent = age > 90
      ? `Last location ${Math.max(1, Math.round(age / 60))} min ago. The rider’s phone may be out of signal.`
      : `Live location · updated ${age}s ago`;
    if (!window.L) return;
    const latlng = [Number(point.latitude), Number(point.longitude)];
    if (!map) {
      map = window.L.map("deliveryMap", { zoomControl: true, attributionControl: true }).setView(latlng, 15);
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: "© OpenStreetMap © CARTO"
      }).addTo(map);
      marker = window.L.circleMarker(latlng, {
        radius: 10,
        color: "#fff7e8",
        weight: 2,
        fillColor: "#ef233c",
        fillOpacity: 1
      }).addTo(map);
    } else {
      marker.setLatLng(latlng);
      map.panTo(latlng);
    }
    window.setTimeout(() => map.invalidateSize(), 60);
  }

  window.SobersDeliveryMap = { show, hide };
})();
