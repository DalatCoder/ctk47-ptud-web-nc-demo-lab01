/**
 * Hợp đồng envelope + Problem Details (SPEC §4.1, §5.1).
 *
 * Backend là nguồn sự thật. SPEC §8 ghi nhận mâu thuẫn raw-DTO vs envelope
 * `{ data, meta }`: client chuẩn hóa về `{ data, meta }` và tự adapt raw payload
 * (xem `parseSuccess` trong client.ts).
 */

/** Success envelope thống nhất cho mọi response. */
export interface ApiSuccess<T> {
  data: T;
  meta?: PaginationMeta;
}

/** Thông tin phân trang (SPEC §2.5): page/pageSize/tổng số/tổng trang/cờ trước-sau. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** Dạng body trả về của endpoint list/search (SPEC §2.5). */
export interface PagedResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** RFC 7807 Problem Details (SPEC §5.1). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** Mã lỗi nghiệp vụ, ví dụ `AUTH_EMAIL_EXISTS` (SPEC §5.2). */
  code?: string;
  /** Lỗi theo field, được mapper đưa vào React Hook Form (SPEC §4.1). */
  errors?: Record<string, string[]>;
}

/** Mã lỗi nghiệp vụ đã liệt kê trong SPEC §5.2. */
export const ErrorCode = {
  AuthEmailExists: "AUTH_EMAIL_EXISTS",
  AuthInvalidCredentials: "AUTH_INVALID_CREDENTIALS",
  AuthRefreshTokenExpired: "AUTH_REFRESH_TOKEN_EXPIRED",
  AuthRefreshTokenRevoked: "AUTH_REFRESH_TOKEN_REVOKED",
  RecipeNotFound: "RECIPE_NOT_FOUND",
  RecipePublishIncomplete: "RECIPE_PUBLISH_INCOMPLETE",
  RecipeForbidden: "RECIPE_FORBIDDEN",
  RecipeConcurrencyConflict: "RECIPE_CONCURRENCY_CONFLICT",
  CategoryDeleteHasRecipes: "CATEGORY_DELETE_HAS_RECIPES",
  FileSizeExceeded: "FILE_SIZE_EXCEEDED",
  FileMimeInvalid: "FILE_MIME_INVALID",
  ValidationError: "VALIDATION_ERROR",
  RateLimitExceeded: "RATE_LIMIT_EXCEEDED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
