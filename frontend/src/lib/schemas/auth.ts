import { z } from "zod";

/**
 * Schema validation phía client (SPEC §4.2). Chỉ hỗ trợ UX — API (FluentValidation)
 * là authority cuối cùng.
 *
 * Quy tắc mật khẩu theo SRS §2.4: tối thiểu 8 ký tự, gồm chữ hoa, chữ thường,
 * chữ số và ký tự đặc biệt.
 */

const password = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .regex(/[A-Z]/, "Mật khẩu phải chứa chữ hoa")
  .regex(/[a-z]/, "Mật khẩu phải chứa chữ thường")
  .regex(/[0-9]/, "Mật khẩu phải chứa chữ số")
  .regex(/[^A-Za-z0-9]/, "Mật khẩu phải chứa ký tự đặc biệt");

export const loginSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const registerSchema = z
  .object({
    email: z.email("Email không hợp lệ"),
    password,
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
