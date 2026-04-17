import { Router } from "express";
import { SEARCH_RADIUS_METERS } from "../config/app-config.js";
import { fetchOverpassFromMirrors, getDistanceKm } from "../services/core-utils.js";

const router = Router();

router.get("/api/banks", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({
      error: "lat and lng query params are required numbers"
    });
    return;
  }

  const radiusMeters = Math.max(
    100,
    Math.min(Number(req.query.radiusMeters) || SEARCH_RADIUS_METERS, 50000)
  );
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 3, 50));

  const query = `
[out:json][timeout:25];
(
  node["amenity"~"bank|atm"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"bank|atm"](around:${radiusMeters},${lat},${lng});
);
out center;
`;

  try {
    const text = await fetchOverpassFromMirrors(query);
    const trimmed = text.trimStart();

    if (!trimmed.startsWith("{")) {
      res.status(503).json({
        error: "Overpass is busy or rate-limited",
        details: trimmed.slice(0, 200)
      });
      return;
    }

    const data = JSON.parse(trimmed);
    const elements = Array.isArray(data.elements) ? data.elements : [];

    const sorted = elements
      .map((place) => {
        const placeLat = place.lat || place.center?.lat;
        const placeLng = place.lon || place.center?.lon;

        if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
          return null;
        }

        const distanceKm = getDistanceKm(lat, lng, placeLat, placeLng);
        const type = place.tags?.amenity === "atm" ? "ATM" : "Bank";
        const name = place.tags?.name || place.tags?.brand || type;

        return {
          id: place.id,
          type,
          name,
          distanceKm: Number(distanceKm.toFixed(2)),
          lat: placeLat,
          lng: placeLng
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    res.json({
      count: sorted.length,
      radiusMeters,
      results: sorted
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch nearby banks",
      details: error?.message || "Unknown error"
    });
  }
});

export default router;
