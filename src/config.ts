// Configuration is read once from the environment at startup. Both values are
// required; the MCP server is useless without a Flightdeck URL and a token.
export interface Config {
  /** Base origin of the Flightdeck install, e.g. https://flightdeck.example.com */
  baseUrl: string;
  /** A personal access token (fd_pat_…) created under Settings → API tokens. */
  token: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = env.FLIGHTDECK_BASE_URL?.trim();
  const token = env.FLIGHTDECK_API_TOKEN?.trim();

  if (!baseUrl) {
    throw new Error(
      "FLIGHTDECK_BASE_URL is required (e.g. https://flightdeck.example.com)",
    );
  }
  if (!token) {
    throw new Error(
      "FLIGHTDECK_API_TOKEN is required — a personal access token (fd_pat_…) " +
        "from Flightdeck → Settings → API tokens",
    );
  }

  // Strip any trailing slashes so we can join paths predictably.
  const normalized = baseUrl.replace(/\/+$/, "");

  // Validate up-front so a malformed URL fails at startup with a clear message,
  // rather than throwing a cryptic "Invalid URL" from deep in the client on the
  // first request.
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`FLIGHTDECK_BASE_URL is not a valid URL: ${normalized}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      `FLIGHTDECK_BASE_URL must be an http(s) URL (got ${parsed.protocol})`,
    );
  }

  return { baseUrl: normalized, token };
}
