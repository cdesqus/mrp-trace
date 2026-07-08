import { mockApi, recordMockActivity } from "@/lib/mock-api";

export const stationHeaders = {
  "Content-Type": "application/json",
  "X-Operator-ID": process.env.NEXT_PUBLIC_OPERATOR_ID ?? "POC-OPERATOR",
  "X-Station-ID": process.env.NEXT_PUBLIC_STATION_ID ?? "POC-STATION",
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" && typeof window !== "undefined") {
    const result = await mockApi<T>(path, init);
    recordMockActivity(path, init?.method?.toUpperCase() ?? "GET");
    return result;
  }
  const response = await fetch(path, { ...init, headers: { ...stationHeaders, ...init?.headers } });
  const rawBody = await response.text();
  let body: unknown = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && path !== "/api/auth/login") {
      window.location.replace("/login");
    }
    const apiError =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : null;
    const gatewayFailure =
      response.status >= 500 &&
      (typeof body !== "string" || /internal server error|bad gateway|fetch failed/i.test(body));

    throw new Error(
      apiError ??
        (gatewayFailure
          ? "Backend service is unavailable. Check the API server and database connection."
          : `Request failed with status ${response.status}.`),
    );
  }

  if (body === null) return undefined as T;
  if (typeof body === "string") {
    throw new Error("The backend returned an invalid response format.");
  }
  return body as T;
}

export async function apiBlob(path: string, init?: RequestInit): Promise<Blob> {
  const response = await fetch(path, { ...init, headers: { ...stationHeaders, ...init?.headers } });
  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(rawBody || `Request failed with status ${response.status}.`);
  }
  return response.blob();
}
