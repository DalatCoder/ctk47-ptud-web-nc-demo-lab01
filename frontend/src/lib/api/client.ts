/**
 * API client duy nhất (SPEC §4.1).
 *
 * - baseUrl từ environment (`NEXT_PUBLIC_API_URL`).
 * - JSON gửi `Content-Type: application/json`; FormData KHÔNG tự đặt
 *   Content-Type để browser tạo multipart boundary.
 * - Gắn `Authorization: Bearer <accessToken>` khi có token.
 * - Chuẩn hóa response về `{ data, meta }`; lỗi thành `ApiError` (ProblemDetails)
 *   kèm `X-Correlation-ID` để trace.
 * - `401` → refresh single-flight một lần → thử lại request ban đầu (chỉ request
 *   idempotent); KHÔNG tự retry mutation không idempotent.
 */

import type { ApiSuccess, PaginationMeta, ProblemDetails } from "./types";
import { tokenStore, type TokenPair } from "./token-store";

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  /** JSON body — tự serialize và đặt Content-Type. */
  json?: unknown;
  /** FormData body — không đặt Content-Type (boundary do browser tạo). */
  formData?: FormData;
  signal?: AbortSignal;
  /** Thử lại một lần sau 401→refresh. Mặc định true cho method idempotent. */
  retryAfterRefresh?: boolean;
}

/** Lỗi API đã chuẩn hóa (SPEC §4.1). Không bao giờ hiển thị stack trace. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;
  readonly correlationId?: string;

  constructor(status: number, problem: ProblemDetails, correlationId?: string) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
    this.correlationId = correlationId;
  }

  /** Lỗi theo field, để mapper đưa vào React Hook Form. */
  get fieldErrors(): Record<string, string[]> | undefined {
    return this.problem.errors;
  }
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: PaginationMeta }> {
  const method = options.method ?? "GET";
  // Chỉ GET an toàn để retry sau refresh; mọi mutation khác không tự retry (§4.1).
  const retryAfterRefresh = options.retryAfterRefresh ?? method === "GET";

  const res = await dispatch(path, options, method);
  if (res.status !== 401) return handleResponse<T>(res);

  // 401 → refresh một lần (single-flight).
  const refreshed = await refreshTokens();

  if (refreshed && retryAfterRefresh) {
    const retryRes = await dispatch(path, options, method);
    if (retryRes.status === 401) {
      tokenStore.clear();
      throw await toApiError(retryRes);
    }
    return handleResponse<T>(retryRes);
  }

  // Refresh thất bại → phiên hết hạn; dọn token. Mutation (non-idempotent)
  // không tự retry để tránh double-execute: ném 401 gốc cho caller quyết định.
  if (!refreshed) tokenStore.clear();
  throw await toApiError(res);
}

async function dispatch(
  path: string,
  options: RequestOptions,
  method: HttpMethod,
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  const headers = new Headers();

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  // `formData` → không đặt Content-Type để browser tạo boundary (§4.1).

  const accessToken = tokenStore.getAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const init: RequestInit = { method, headers, signal: options.signal };
  if (options.json !== undefined) init.body = JSON.stringify(options.json);
  if (options.formData !== undefined) init.body = options.formData;

  return fetch(url, init);
}

async function handleResponse<T>(
  res: Response,
): Promise<{ data: T; meta?: PaginationMeta }> {
  if (res.ok) return parseSuccess<T>(res);
  throw await toApiError(res);
}

async function parseSuccess<T>(
  res: Response,
): Promise<{ data: T; meta?: PaginationMeta }> {
  const text = await res.text();
  if (!text) return { data: undefined as T };

  const body = JSON.parse(text) as ApiSuccess<T> | T;
  // Adapt envelope `{ data, meta }` vs raw DTO (mâu thuẫn §8).
  if (body !== null && typeof body === "object" && "data" in body) {
    const envelope = body as ApiSuccess<T>;
    return { data: envelope.data, meta: envelope.meta };
  }
  return { data: body as T };
}

async function toApiError(res: Response): Promise<ApiError> {
  const correlationId = res.headers.get("X-Correlation-ID") ?? undefined;

  let problem: ProblemDetails;
  try {
    const body = (await res.json()) as ProblemDetails;
    problem = { ...body, status: body.status ?? res.status };
  } catch {
    problem = {
      type: "about:blank",
      title: res.statusText,
      status: res.status,
      detail: res.statusText,
    };
  }

  return new ApiError(res.status, problem, correlationId);
}

// ── Refresh single-flight (§4.1, §5.1) ───────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

/**
 * Chạy đúng một refresh request tại một thời điểm; các request 401 đồng thời
 * cùng chờ một Promise này. Rotation bắt buộc: luôn thay cặp token cũ bằng cặp
 * token mới từ response (§5.1).
 */
async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = tokenStore.getRefreshToken();
      if (!refreshToken) return false;

      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;

      const body = (await res.json()) as ApiSuccess<TokenPair> | TokenPair;
      const tokens =
        body !== null && typeof body === "object" && "data" in body
          ? (body as ApiSuccess<TokenPair>).data
          : (body as TokenPair);

      if (!tokens?.accessToken || !tokens?.refreshToken) return false;

      tokenStore.setTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
