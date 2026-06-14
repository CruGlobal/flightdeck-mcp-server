// Thin HTTP client over the Flightdeck public REST API (FD-107). It speaks only
// to /api/v1, authenticating with a personal access token (FD-108) as a bearer
// token. It deliberately knows nothing about Rails internals — the public
// contract is the entire surface.

const API_PREFIX = "/api/v1";

export type QueryValue = string | number | boolean | undefined | null;

/** Flightdeck resource ids are integers, but callers may pass them as strings. */
export type Id = string | number;

const seg = (id: Id) => encodeURIComponent(String(id));

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
}

/** Raised when Flightdeck returns a non-2xx response. */
export class FlightdeckApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "FlightdeckApiError";
  }
}

export class FlightdeckClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async request<T = unknown>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    // Concatenate onto the full base URL (rather than resolving API_PREFIX as an
    // absolute path against the origin) so a base URL that includes a path prefix
    // — e.g. when Flightdeck is reverse-proxied under https://host/flightdeck — is
    // preserved. baseUrl is validated and trailing-slash-stripped in config.ts.
    const url = new URL(`${this.baseUrl}${API_PREFIX}${path}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await fetch(url, { method: opts.method ?? "GET", headers, body });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new FlightdeckApiError(0, `Could not reach Flightdeck at ${url.origin}: ${reason}`);
    }

    // 204 No Content (e.g. DELETE) — nothing to parse.
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = undefined;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      // The API uses a uniform { "error": "<string>" } envelope for every non-2xx.
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new FlightdeckApiError(response.status, message);
    }

    return payload as T;
  }

  // ---- Identity ----------------------------------------------------------
  me() {
    return this.request("/me");
  }

  // ---- Projects ----------------------------------------------------------
  listProjects(query: { page?: number; per_page?: number }) {
    return this.request("/projects", { query });
  }

  getProject(id: Id) {
    return this.request(`/projects/${seg(id)}`);
  }

  // ---- Work items --------------------------------------------------------
  listWorkItems(projectId: Id, query: { page?: number; per_page?: number }) {
    return this.request(`/projects/${seg(projectId)}/work_items`, { query });
  }

  getWorkItem(id: Id) {
    return this.request(`/work_items/${seg(id)}`);
  }

  createWorkItem(projectId: Id, attributes: Record<string, unknown>) {
    return this.request(`/projects/${seg(projectId)}/work_items`, {
      method: "POST",
      body: { work_item: attributes },
    });
  }

  updateWorkItem(id: Id, attributes: Record<string, unknown>) {
    return this.request(`/work_items/${seg(id)}`, {
      method: "PATCH",
      body: { work_item: attributes },
    });
  }

  deleteWorkItem(id: Id) {
    return this.request(`/work_items/${seg(id)}`, { method: "DELETE" });
  }

  // ---- Cycles ------------------------------------------------------------
  listCycles(projectId: Id, query: { page?: number; per_page?: number }) {
    return this.request(`/projects/${seg(projectId)}/cycles`, { query });
  }

  getCycle(id: Id) {
    return this.request(`/cycles/${seg(id)}`);
  }

  // ---- Modules -----------------------------------------------------------
  listModules(projectId: Id, query: { page?: number; per_page?: number }) {
    return this.request(`/projects/${seg(projectId)}/modules`, { query });
  }

  getModule(id: Id) {
    return this.request(`/modules/${seg(id)}`);
  }

  // ---- Comments ----------------------------------------------------------
  listComments(workItemId: Id, query: { page?: number; per_page?: number }) {
    return this.request(`/work_items/${seg(workItemId)}/comments`, { query });
  }

  createComment(workItemId: Id, body: string) {
    return this.request(`/work_items/${seg(workItemId)}/comments`, {
      method: "POST",
      body: { comment: { body } },
    });
  }
}
