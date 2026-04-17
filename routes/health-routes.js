import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Vernacular FD Advisor API is running",
    endpoints: [
      "GET /health",
      "GET /api/banks?lat=12.9716&lng=77.5946&limit=3&radiusMeters=10000",
      "POST /api/transcribe",
      "POST /api/tts",
      "POST /api/financial-assistant",
      "POST /api/fd-recommendations",
      "POST /api/fd-advisor-chat"
    ]
  });
});

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

export default router;
