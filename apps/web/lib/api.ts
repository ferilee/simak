export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

/**
 * Galat respons API: tetap sebuah Error dengan pesan yang sama seperti
 * sebelumnya (semua pemeriksaan `error.message` yang ada tidak berubah),
 * tetapi kini juga membawa status HTTP dan badan `data` respons galat —
 * dibutuhkan halaman yang harus bereaksi pada bentuk galat tertentu,
 * mis. halaman tunggu "Penugasan belum dibuka" (403 + data jadwal).
 */
export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as T & { message?: string; data?: unknown };
  if (!response.ok) {
    throw new ApiError(body.message ?? "Permintaan tidak dapat diproses.", response.status, body.data ?? null);
  }
  return body;
}
