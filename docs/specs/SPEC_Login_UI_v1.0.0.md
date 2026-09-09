# SPEC Login UI — Culinary Blog

| Thuộc tính | Giá trị |
| --- | --- |
| Phiên bản | 1.0.0 |
| Phạm vi | Màn hình đăng nhập local tại `/auth/login` |
| Trạng thái | Sẵn sàng triển khai frontend |
| Nguồn tham chiếu | `SPEC_Culinary_Blog_v1.0.0.md`; `SPEC_Culinary_Blog_Frontend_v1.0.0.md` |

## 1. Mục tiêu và phạm vi

Trang `/auth/login` là Client Component để người dùng đăng nhập bằng email và mật khẩu. Giao diện dùng phong cách tối giản hiện hữu của Culinary Blog: font Geist, màu trung tính, card một cột và không thêm thư viện UI, ảnh hoặc thay đổi global header/footer.

Trong phạm vi phiên bản này:

- Form có trường email, mật khẩu và nút `Đăng nhập`.
- Nút Google hiển thị `Đăng nhập với Google (Sắp ra mắt)` và bị vô hiệu hóa; không khởi tạo Auth.js hoặc OAuth.
- Không có link đăng ký hay quên mật khẩu.
- Sau khi đăng nhập local thành công, chuyển đến `/dashboard`.

Ngoài phạm vi: đăng ký, khôi phục mật khẩu, session persistence, logout, dashboard guard và triển khai Google OAuth.

## 2. Hành vi và tích hợp

- Form dùng React Hook Form và `loginSchema`: email phải đúng định dạng, mật khẩu là bắt buộc. Lỗi hiển thị ngay dưới trường liên quan.
- Submit gửi `POST /auth/login` với JSON `{ "email": string, "password": string }` qua API client hiện có.
- Client chấp nhận response raw hoặc success envelope `{ data }`, với `data` là `{ accessToken, refreshToken }`; sau thành công lưu cặp token vào `tokenStore` hiện có rồi `replace` đến `/dashboard`.
- Nếu trang được mở khi `tokenStore` đang có access token, chuyển đến `/dashboard` mà không hiển thị form lâu hơn cần thiết.
- Nút submit bị vô hiệu hóa trong lúc request. Không retry tự động mutation login.
- `400`/`422` có lỗi field được map vào email hoặc mật khẩu. `AUTH_INVALID_CREDENTIALS` và `401` hiển thị một thông điệp chung, không cho biết email có tồn tại. Lỗi không gắn field hiển thị ở mức form; không hiển thị stack trace hay token.

## 3. UI và accessibility

- Nội dung nằm trong `main`, card có `h1`, `form`, `label` gắn với input và thứ tự tab email → mật khẩu → submit → Google.
- Input lỗi dùng `aria-invalid` và `aria-describedby` liên kết tới phần mô tả lỗi. Lỗi form dùng vùng `role="alert"`.
- Focus ring hiển thị rõ, độ tương phản đạt WCAG 2.1 AA, vùng chạm của button phù hợp trên mobile.
- Từ 320 px đến desktop, card giữ chiều rộng dễ đọc, padding co giãn và không tạo cuộn ngang.

## 4. Ràng buộc và điểm chờ xác nhận

- Token chỉ lưu in-memory theo `tokenStore`; reload trang sẽ mất phiên. Không tự thay đổi sang cookie hoặc localStorage khi chưa có security review.
- Google OAuth chưa được bật vì `auth.ts` chưa có provider/configuration và contract callback/token với backend chưa được chốt.
- Contract chính xác của `POST /auth/login` chưa có OpenAPI. UI dùng payload/response đã được suy ra từ schema và `TokenPair` hiện hữu; backend cần xác nhận trước khi tích hợp production.

## 5. Tiêu chí chấp nhận

- Email không hợp lệ hoặc mật khẩu trống không gửi request và hiển thị lỗi inline.
- Login thành công lưu đủ access/refresh token, sau đó đi tới `/dashboard`.
- Lỗi credentials hiển thị thông điệp chung; lỗi API field hiển thị đúng trường; pending không thể submit lặp.
- Nút Google thể hiện rõ là chưa sẵn sàng và không tạo request.
- Trang chạy đúng ở mobile, tablet, desktop; thao tác keyboard và focus hoạt động đầy đủ.
