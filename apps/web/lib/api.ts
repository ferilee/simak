export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? "Permintaan tidak dapat diproses.");
  }
  return body;
}
