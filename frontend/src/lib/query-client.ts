import { QueryClient } from "@tanstack/react-query";

const queryDefaults = {
  staleTime: 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
};

let browserClient: QueryClient | undefined;

/** Server-safe: mỗi render server tạo instance riêng; client dùng chung một. */
export function getQueryClient() {
  if (typeof window === "undefined") {
    return new QueryClient({ defaultOptions: { queries: queryDefaults } });
  }
  if (!browserClient) {
    browserClient = new QueryClient({ defaultOptions: { queries: queryDefaults } });
  }
  return browserClient;
}

/**
 * Query keys phản chiếu resource + tham số URL (SPEC §4.1).
 * Mutation của recipe/category/image/step/ingredient phải invalidate `list`/`detail`
 * của resource liên quan.
 */
export const queryKeys = {
  categories: {
    all: ["categories"] as const,
    list: (params?: Record<string, unknown>) =>
      ["categories", "list", params ?? {}] as const,
    detail: (slug: string) => ["categories", "detail", slug] as const,
  },
  recipes: {
    all: ["recipes"] as const,
    list: (params?: Record<string, unknown>) =>
      ["recipes", "list", params ?? {}] as const,
    detail: (slug: string) => ["recipes", "detail", slug] as const,
    search: (params?: Record<string, unknown>) =>
      ["recipes", "search", params ?? {}] as const,
  },
};
