import "dotenv/config";
import fs from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const kalshiEnv = (process.env.KALSHI_ENV ?? "demo").toLowerCase();
if (kalshiEnv !== "demo" && kalshiEnv !== "prod") {
  throw new Error(`KALSHI_ENV must be "demo" or "prod", got "${kalshiEnv}"`);
}

const baseUrl =
  kalshiEnv === "prod"
    ? "https://api.elections.kalshi.com/trade-api/v2"
    : "https://demo-api.kalshi.co/trade-api/v2";

function loadPrivateKeyPem(): string {
  if (process.env.KALSHI_PRIVATE_KEY) {
    return process.env.KALSHI_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  const path = required("KALSHI_PRIVATE_KEY_PATH");
  return fs.readFileSync(path, "utf8");
}

export const config = {
  kalshiEnv: kalshiEnv as "demo" | "prod",
  kalshiBaseUrl: baseUrl,
  kalshiApiKeyId: required("KALSHI_API_KEY_ID"),
  kalshiPrivateKeyPem: loadPrivateKeyPem(),
  port: Number(process.env.PORT ?? 8787),
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  slippageBufferCents: Number(process.env.SLIPPAGE_BUFFER_CENTS ?? 2),
};
