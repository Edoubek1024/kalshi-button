/**
 * Kalshi CORS relay.
 *
 * Holds NO secrets. Its only job is to get around the fact that browsers
 * enforce CORS and Kalshi's API doesn't allowlist the KALSHI-ACCESS-* auth
 * headers for cross-origin requests. The browser signs each request itself
 * (see web/src/kalshi/signing.ts) and this worker just forwards the
 * already-signed request to the real Kalshi API and relays the response
 * back with permissive CORS headers.
 *
 * Because it's secret-free, there is nothing sensitive to steal from this
 * worker itself — but it's still restricted to the two real Kalshi hosts
 * (not an open proxy to arbitrary URLs) and to one browser origin.
 *
 * URL shape: https://<this-worker>/<demo|prod>/<kalshi path>
 *   e.g.    /demo/portfolio/positions?event_ticker=FOO
 *   ->      https://demo-api.kalshi.co/trade-api/v2/portfolio/positions?event_ticker=FOO
 */

const UPSTREAMS = {
  demo: "https://demo-api.kalshi.co/trade-api/v2",
  prod: "https://api.elections.kalshi.com/trade-api/v2",
};

const ALLOWED_REQUEST_HEADERS = [
  "content-type",
  "kalshi-access-key",
  "kalshi-access-signature",
  "kalshi-access-timestamp",
];

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, KALSHI-ACCESS-KEY, KALSHI-ACCESS-SIGNATURE, KALSHI-ACCESS-TIMESTAMP",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const [, envSegment, ...rest] = url.pathname.split("/");
    const upstreamBase = UPSTREAMS[envSegment];

    if (!upstreamBase) {
      return new Response(JSON.stringify({ error: "URL must start with /demo/ or /prod/" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const upstreamUrl = `${upstreamBase}/${rest.join("/")}${url.search}`;

    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (ALLOWED_REQUEST_HEADERS.includes(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });

    const responseHeaders = new Headers(cors);
    responseHeaders.set("Content-Type", upstreamResponse.headers.get("Content-Type") || "application/json");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
