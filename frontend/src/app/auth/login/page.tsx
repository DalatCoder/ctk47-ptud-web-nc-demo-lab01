"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ApiError, request } from "@/lib/api/client";
import { tokenStore, type TokenPair } from "@/lib/api/token-store";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";

const fieldNames = ["email", "password"] as const;

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (tokenStore.getAccessToken()) router.replace("/dashboard");
  }, [router]);

  async function onSubmit(input: LoginInput) {
    try {
      const { data: tokens } = await request<TokenPair>("/auth/login", {
        method: "POST",
        json: input,
        retryAfterRefresh: false,
      });

      if (!tokens.accessToken || !tokens.refreshToken) {
        throw new Error("Phản hồi đăng nhập không chứa token hợp lệ.");
      }

      tokenStore.setTokens(tokens);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        let hasFieldError = false;

        for (const field of fieldNames) {
          const message = error.fieldErrors?.[field]?.[0];
          if (!message) continue;

          setError(field, { type: "server", message });
          hasFieldError = true;
        }

        if (hasFieldError) return;

        const isInvalidCredentials =
          error.status === 401 ||
          error.problem.code === "AUTH_INVALID_CREDENTIALS";
        setError("root", {
          type: "server",
          message: isInvalidCredentials
            ? "Email hoặc mật khẩu không đúng."
            : "Không thể đăng nhập lúc này. Vui lòng thử lại.",
        });
        return;
      }

      setError("root", {
        type: "server",
        message: "Không thể đăng nhập lúc này. Vui lòng thử lại.",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-16 sm:py-24">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-sm sm:p-8"
      >
        <div className="space-y-2 text-center">
          <h1 id="login-title" className="text-3xl font-semibold tracking-tight">
            Đăng nhập
          </h1>
          <p className="text-sm text-zinc-600">
            Tiếp tục quản lý và chia sẻ công thức của bạn.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {errors.root && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errors.root.message}
            </p>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              {...register("email")}
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/20 aria-[invalid=true]:border-red-600"
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-red-700">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Mật khẩu
            </label>
            <input
              {...register("password")}
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/20 aria-[invalid=true]:border-red-600"
            />
            {errors.password && (
              <p id="password-error" className="text-sm text-red-700">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs text-zinc-500">hoặc</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-500"
        >
          Đăng nhập với Google (Sắp ra mắt)
        </button>
      </section>
    </main>
  );
}
