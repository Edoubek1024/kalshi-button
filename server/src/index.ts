import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { KalshiApiError } from "./kalshi/client.js";
import { resolveRouter } from "./routes/resolve.js";
import { marketsRouter } from "./routes/markets.js";
import { positionsRouter } from "./routes/positions.js";
import { ordersRouter } from "./routes/orders.js";

const app = express();

app.use(
  cors({
    origin: config.webOrigins,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, kalshiEnv: config.kalshiEnv });
});

app.use("/api", resolveRouter);
app.use("/api", marketsRouter);
app.use("/api", positionsRouter);
app.use("/api", ordersRouter);

// Central error handler. KalshiApiError carries the upstream status/message;
// everything else is an unexpected 500. Never leak credentials in errors.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof KalshiApiError) {
    console.error(`Kalshi API error (${err.status}):`, err.message, err.body);
    res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: err.message,
      kalshiCode: err.body?.code,
    });
    return;
  }

  console.error("Unexpected server error:", err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, () => {
  console.log(`Kalshi Button server listening on :${config.port} (env: ${config.kalshiEnv})`);
});
