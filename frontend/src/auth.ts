import NextAuth from "next-auth";

/**
 * Auth.js v5 (SPEC §5.2).
 *
 * Phạm vi frontend: điều phối đăng nhập Google + trạng thái phiên giao diện.
 * Access/refresh JWT nghiệp vụ vẫn do backend phát hành và xác minh.
 *
 * Provider Google bị hoãn cho tới khi §8 chốt luồng callback (Auth.js callback
 * vs `POST /auth/google`) và payload credential. Không tự đổi contract sang cookie.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
});
