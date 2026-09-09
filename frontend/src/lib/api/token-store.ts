/**
 * Token storage abstraction (SPEC §5.1, §8).
 *
 * SPEC bắt buộc refresh token nằm ở request body (không dùng cookie) và cấm
 * serialize token vào URL/log/analytics/cache public. Mô hình persistence cụ thể
 * (localStorage vs memory-only vs httpOnly cookie) là quyết định bảo mật đang
 * chờ backend/product chốt (§8). Module này cô lập storage sau một interface để
 * việc đổi policy chỉ là sửa một file.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: TokenPair): void;
  clear(): void;
}

/**
 * Default: in-memory (không persistence) — an toàn với XSS, đổi policy sau khi
 * security review §8 được chốt (ví dụ đổi sang localStorage).
 */
export const tokenStore: TokenStore = (() => {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
})();
