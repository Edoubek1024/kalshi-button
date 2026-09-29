/**
 * Kalshi market/event URLs embed a ticker in the path (and sometimes in a
 * query string), but the exact slug format has changed over time and differs
 * between the web app and share links. Rather than hard-coding a URL shape,
 * we pull out every plausible ticker-looking token and let the caller try
 * each one against the real API until one resolves.
 */
export function extractTickerCandidates(input: string): string[] {
  const trimmed = input.trim();
  const candidates = new Set<string>();

  let url: URL | undefined;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a URL — maybe the user pasted a bare ticker. Fall through.
  }

  const rawTokens: string[] = [];

  if (url) {
    for (const segment of url.pathname.split("/")) {
      if (segment) rawTokens.push(segment);
    }
    for (const value of url.searchParams.values()) {
      rawTokens.push(value);
    }
  } else {
    rawTokens.push(trimmed);
  }

  for (const token of rawTokens) {
    const upper = decodeURIComponent(token).toUpperCase();
    // Ticker-shaped: letters/digits/hyphens/underscores, at least one non-numeric run.
    if (/^[A-Z0-9_-]{3,80}$/.test(upper) && /[A-Z]/.test(upper)) {
      candidates.add(upper);
    }
  }

  // Prefer longer, more specific tokens first (market tickers are usually
  // longer than series slugs), then fall back to shorter ones.
  return Array.from(candidates).sort((a, b) => b.length - a.length);
}
