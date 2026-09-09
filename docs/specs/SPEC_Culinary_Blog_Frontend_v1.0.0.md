# SPEC Frontend — Culinary Blog

| Thuộc tính | Giá trị |
| --- | --- |
| Phiên bản | 1.0.0 |
| Phạm vi | Kiến trúc, tích hợp và yêu cầu chất lượng frontend web |
| Nguồn tham chiếu | `SPEC_Culinary_Blog_v1.0.0.md`; `../SRS_Culinary_Blog_v1.0.0.pdf` |
| Ngôn ngữ | Tiếng Việt |
| Trạng thái | Derived from approved SRS — có khuyến nghị frontend, không thay đổi contract backend chưa được chốt |

## 1. Mục tiêu và ranh giới

Frontend là ứng dụng Next.js App Router độc lập, cung cấp giao diện web responsive, SEO cho nội dung công khai và trải nghiệm thao tác cho Guest, Author, Admin. Ứng dụng không chứa nghiệp vụ, truy cập trực tiếp PostgreSQL/Redis/MinIO, hoặc dùng shared view engine với .NET API. Mọi dữ liệu nghiệp vụ đi qua REST API `/api/v1` dưới dạng JSON; upload ảnh là `multipart/form-data`.

Browser truy cập Next.js qua Nginx. Next.js gọi .NET Minimal API; API là nguồn sự thật về quyền, visibility, validation, concurrency và trạng thái recipe. Kiểm tra quyền ở frontend chỉ để điều hướng/ẩn UI phù hợp, không thay thế authorization phía API.

```text
Browser ─HTTPS─> Nginx ─> Next.js App Router ─REST/JSON─> .NET API
                                  │                         │
                                  └── render/cache UI        └── PostgreSQL / Redis / MinIO
```

Ngoài phạm vi tài liệu này: thiết kế database, endpoint implementation, mobile native, GraphQL, bình luận, đánh giá, bookmark, notification real-time và thanh toán.

## 2. Công nghệ frontend và trách nhiệm

| Công nghệ | Vai trò bắt buộc | Ranh giới sử dụng |
| --- | --- | --- |
| Next.js App Router | File-based routes, Server/Client Components, SSR/ISR/CSR, metadata, sitemap/robots và tối ưu ảnh. | Nội dung public ưu tiên Server Components; chỉ thêm `use client` tại ranh giới cần tương tác/trình duyệt. Không dùng Pages Router. |
| TypeScript | Kiểu hóa DTO, query parameter, lỗi Problem Details và props UI. | API client trả kiểu dữ liệu rõ ràng; không dùng `any` để né contract chưa chốt. |
| Tailwind CSS | Layout utility-first, responsive và trạng thái UI nhất quán. | Không dùng CSS framework khác; component semantic HTML vẫn là nguồn accessibility. |
| Auth.js v5 | Điều phối đăng nhập Google/callback ở Next.js và trạng thái phiên giao diện. | Không phát hành JWT nghiệp vụ; backend vẫn phát hành/xác minh access và refresh token. Xem §5. |
| TanStack Query | Cache, loading/error state, mutation, invalidation và optimistic UI của phần CSR. | Chỉ quản lý server state phía client; không dùng làm global UI-state store. |
| React Hook Form | Quản lý form, field state, submit và lỗi inline. | Dùng cho login, đăng ký, profile và wizard recipe. |
| Zod | Schema validation phía client và suy luận TypeScript cho form/input. | Validation client hỗ trợ UX; API/FluentValidation là authority cuối cùng. |

Không bổ sung Redux, Zustand hoặc thư viện CSS/UI thứ hai ở v1. State cục bộ như modal, tab, thứ tự wizard và trạng thái mở/đóng nằm trong React component; server state nằm trong TanStack Query; form state nằm trong React Hook Form.

## 3. Rendering, routes và SEO

| Route | Rendering | Revalidate / cache | Auth và hành vi |
| --- | --- | --- | --- |
| `/` | ISR | 3600 giây | Public; recipe nổi bật và category. |
| `/recipes` | SSR dynamic | Không full-route cache | Public; nhận filter, sort, pagination từ URL. |
| `/recipes/[slug]` | ISR | 300 giây | Public; render recipe Published, metadata và Recipe JSON-LD. |
| `/categories` | ISR | 3600 giây | Public. |
| `/categories/[slug]` | ISR | 600 giây | Public; danh sách recipe Published. |
| `/search` | SSR dynamic | Không full-route cache | Public; query tối thiểu 2 ký tự, phản chiếu URL. |
| `/auth/login`, `/auth/register` | CSR | N/A | Chuyển dashboard nếu đã xác thực. |
| `/dashboard`, `/dashboard/recipes`, `/dashboard/recipes/new`, `/dashboard/recipes/[id]/edit`, `/dashboard/categories`, `/profile` | CSR | TanStack Query | Bắt buộc xác thực; Admin-only cho category management, owner/Admin cho recipe mutation. |

Các trang ISR/SSR public chỉ hiển thị dữ liệu public và không chuyển Bearer token của người dùng lên server render. Trang dashboard/profile CSR lấy session/token sau khi hydrate để tránh cache nội dung riêng tư. Mọi trang cần có loading, error và empty state; mutation có toast kết quả và rollback lạc quan khi request lỗi.

SEO gồm title/description theo recipe/category, canonical URL theo slug, Open Graph, `robots`/sitemap và Recipe JSON-LD. Draft/Archived phải `noindex`; trang Published được phép `index,follow`. Ảnh recipe dùng `next/image`, ưu tiên URL medium/thumbnail do API trả về, đặt `sizes`, `alt` có nghĩa và reserved dimensions để tránh CLS.

## 4. Data flow và API client

### 4.1. Quy ước client

- Dùng một API client có `baseUrl` từ environment: API dev là `http://localhost:5000/api/v1`; production là `https://api.culinaryblog.com/api/v1`.
- Mỗi request JSON gửi `Content-Type: application/json`; upload không tự đặt `Content-Type` để browser tạo boundary cho `FormData`.
- Khi có access token, client gửi `Authorization: Bearer <accessToken>`; nhận và ghi log `X-Correlation-ID` để hỗ trợ trace lỗi.
- Chuẩn hóa response thành `ApiSuccess<T>` (`data`, `meta` khi có) và `ProblemDetails` (`type`, `title`, `status`, `detail`, `errors`). UI không hiển thị raw stack trace hay hard-code thông điệp theo ngôn ngữ.
- `400`/`422` map lỗi trường vào React Hook Form; `401` kích hoạt luồng refresh một lần, rồi thử lại request ban đầu; refresh thất bại thì xóa phiên giao diện và chuyển login; `403`, `404`, `409`, `429`, `503` có UI trạng thái riêng. Không retry tự động mutation không idempotent.
- Query keys của TanStack Query phản chiếu resource và tham số URL. Mutation recipe/category/image/step/ingredient phải invalidate list/detail liên quan; optimistic update chỉ áp dụng khi rollback xác định được.

### 4.2. Form và đồng bộ URL

Zod kiểm tra định dạng, required fields và giới hạn có trong SRS trước submit. Sau response validation từ server, mapper đưa `errors` vào đúng field; lỗi không gắn field hiển thị tại form level. Wizard recipe lưu từng bước trong React Hook Form và gửi đúng DTO khi người dùng submit; `RowVersion` phải được gửi theo contract backend đã chốt để xử lý `409` concurrency.

Filter, sort, `page`, `pageSize` và `q` của danh sách/search là URL search parameters để URL có thể chia sẻ, back/forward hoạt động đúng và SSR đọc được cùng một state. Danh sách không tự giữ filter chỉ trong client state.

## 5. Xác thực và phân quyền UI

### 5.1. Local login và refresh

Login/register gọi API, nhận access token TTL 15 phút và refresh token TTL 7 ngày. Refresh token rotation theo backend là bắt buộc: client luôn thay token cũ bằng cặp token mới từ response và chỉ cho một refresh request chạy tại một thời điểm; các request `401` đồng thời chờ kết quả đó. Logout gọi API revoke refresh token, sau đó dọn session/token phía UI kể cả khi logout API trả thành công idempotent.

Theo SRS, refresh token ở request body và không dùng cookie. Vì vậy token storage, chống XSS và session persistence là quyết định bảo mật cần được chốt với backend trước khi code: frontend không được tự đổi contract sang cookie. Không serialize access/refresh token vào props, URL, log, analytics hoặc cache public.

### 5.2. Google OAuth với Auth.js

Khuyến nghị luồng chuẩn frontend là: Auth.js v5 khởi tạo Authorization Code Flow + PKCE với scope `openid email profile`; callback Next.js nhận identity token/profile; frontend gửi credential Google có thể xác minh tới `POST /auth/google`; backend xác minh issuer, audience, expiry và tạo/liên kết user rồi phát hành cặp JWT riêng của hệ thống. Google credential phải không bị đặt trong URL hoặc log.

UI dùng role từ profile/token chỉ để guard route và action. API vẫn quyết định Owner/Admin, `VerifiedAuthor` và visibility; khi API trả `403`, UI phải phản ánh quyền bị từ chối thay vì giả định local role còn chính xác.

## 6. UI, accessibility và hiệu năng

- Tailwind thiết kế mobile-first: 320–767 px một cột/touch-friendly; 768–1199 px grid hai cột; từ 1200 px full layout.
- Dùng semantic HTML (`main`, `nav`, `article`, `form`, `label`, heading theo cấp), focus visible, thứ tự tab hợp lý, điều khiển bằng keyboard, aria label/message phù hợp và contrast WCAG 2.1 AA.
- Nút submit có trạng thái pending; input lỗi có mô tả liên kết; toast không là kênh duy nhất cho lỗi quan trọng. Skeleton không thay đổi layout sau khi nội dung tải.
- Tuân thủ LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms và first-load JavaScript gzip ≤ 200 KB bằng Server Components, dynamic import cho phần dashboard nặng, `next/image` và tránh đưa TanStack Query/Auth.js vào các route ISR public nếu không cần.

## 7. Kiểm thử chấp nhận frontend

| Nhóm | Tình huống tối thiểu |
| --- | --- |
| Unit/component (Jest + Testing Library) | Zod/RHF hiển thị lỗi inline; mapper Problem Details; trạng thái loading/error/empty; a11y keyboard/focus của form và dialog. |
| API-client/query | Bearer header, upload FormData, refresh single-flight + retry một lần, logout cleanup, mapping `401/403/409/429/503`, invalidation và optimistic rollback. |
| Route/SEO | Đúng SSR/ISR/CSR và TTL; URL filter/search; metadata, canonical, Open Graph, Recipe JSON-LD; Draft/Archived noindex. |
| E2E (Playwright) | Register, login, tạo recipe Draft, publish recipe hợp lệ và search recipe Published; bao gồm role/ownership guard, upload lỗi và conflict update. |
| Chất lượng | Responsive ba breakpoint, Lighthouse Core Web Vitals, không lỗi console nghiêm trọng, screen-reader/keyboard smoke test. |

## 8. Mâu thuẫn nguồn và khuyến nghị cần xác nhận

| Chủ đề | Nguồn hiện có | Khuyến nghị frontend | Việc cần backend/product chốt |
| --- | --- | --- | --- |
| Phiên bản Next.js | SPEC ghi Next.js 14+; SRS tham chiếu tài liệu Next.js 15. | Dùng App Router trên bản stable được dự án chọn, tương thích Node.js 20+; không phụ thuộc API chỉ có ở một major chưa chốt. | Major version, Node version và lockfile chuẩn. |
| Google OAuth | Có callback Next.js/Auth.js, callback API và payload `{ idToken }`/ExternalLoginInfo. | Ưu tiên callback Auth.js tại Next.js rồi gửi Google credential backend-verifiable đến `/auth/google`. | Payload chính xác và endpoint callback duy nhất; backend có xác minh token Google hay exchange authorization code. |
| Success response | SRS vừa nêu `{ data, meta }`, vừa có raw DTO/array/PagedResult. | API client hỗ trợ một envelope thống nhất `{data, meta}`; chỉ adapter tạm thời nếu backend chưa đồng bộ. | Contract OpenAPI chuẩn của toàn bộ endpoint, nhất là pagination. |
| Validation/concurrency | `400` và `422` cùng được dùng cho validation; `409`/`422` cùng được dùng cho concurrency. | Mapper chấp nhận cả status trong giai đoạn chuyển tiếp nhưng hiển thị theo `ProblemDetails.type`/error code. | Mỗi error code có một HTTP status chính thức. |
| Pagination và child DTO | `pageSize` mặc định 10 hoặc 12; step/ingredient fields không thống nhất. | Không hard-code validation/type cuối cùng ngoài contract API đã xác nhận. | Default pageSize và schema request/response cuối cùng. |
| Token persistence | Refresh token ở request body, trong khi Auth.js/session behavior chưa mô tả đầy đủ. | Giữ token ngoài URL/log/cache và chỉ implement storage sau security review. | Mô hình lưu token, session persistence, CSRF/XSS controls và SSR authenticated data policy. |

Cho đến khi các mục trên được xác nhận, frontend có thể phát triển layout, route public, form schema theo SRS và API adapter; không được coi các khuyến nghị trong §8 là thay thế cho API contract đã phê duyệt.
