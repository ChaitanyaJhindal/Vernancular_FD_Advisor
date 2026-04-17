import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PORT } from "./config/app-config.js";
import healthRoutes from "./routes/health-routes.js";
import banksRoutes from "./routes/banks-routes.js";
import speechRoutes from "./routes/speech-routes.js";
import advisorRoutes from "./routes/advisor-routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);
app.use(banksRoutes);
app.use(speechRoutes);
app.use(advisorRoutes);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log("GET /health");
  console.log("GET /api/banks?lat=12.9716&lng=77.5946&limit=3&radiusMeters=10000");
  console.log("POST /api/transcribe (multipart/form-data with audio file field: audio)");
  console.log("POST /api/tts ({ text, target_language_code?, speaker?, model? })");
  console.log("POST /api/financial-assistant ({ userInput, nearbyBanks?, radiusKm? })");
  console.log("POST /api/fd-recommendations ({ amount, tenure_months, user_language, nearbyBanks[] })");
  console.log("POST /api/fd-advisor-chat ({ session_id, userInput, user_language, nearbyBanks[] })");
});
