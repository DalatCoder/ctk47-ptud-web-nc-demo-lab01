# SPEC — Culinary Blog

| Thuộc tính | Giá trị |
| --- | --- |
| Phiên bản SPEC | 1.0.0 |
| Nguồn chuẩn | `source-demo/docs/SRS_Culinary_Blog_v1.0.0.pdf` |
| Ngôn ngữ | Tiếng Việt |
| Mục đích | Bản đặc tả tổng hợp phục vụ thiết kế, phát triển, kiểm thử và review kiến trúc |
| Trạng thái | Derived from approved SRS — các mâu thuẫn nguồn được ghi nhận, không tự chuẩn hóa |

## 1. Tổng quan sản phẩm

Culinary Blog là nền tảng web full-stack để khám phá, chia sẻ và quản lý công thức nấu ăn. Hệ thống tách frontend và backend theo hướng API-driven: Next.js App Router cung cấp trải nghiệm web/SEO; .NET 10 Minimal APIs cung cấp REST API, xử lý nghiệp vụ và tích hợp hạ tầng.

Người dùng có thể xem, tìm kiếm và lọc công thức đã xuất bản; tác giả tạo và vận hành nội dung của chính mình; quản trị viên quản lý danh mục và có quyền can thiệp mọi công thức. Mỗi công thức có thể gồm mô tả, danh mục, thời lượng, độ khó, dinh dưỡng, nguyên liệu, bước thực hiện và bộ ảnh.

### 1.1. Phạm vi

Trong phạm vi v1:

- Đăng ký/đăng nhập cục bộ, Google OAuth, JWT access token và refresh-token rotation.
- CRUD danh mục, công thức, ảnh, nguyên liệu và bước thực hiện.
- Tìm kiếm toàn văn tiếng Việt, lọc, sắp xếp, phân trang.
- Lưu ảnh trên MinIO, xử lý ảnh và email/sitemap qua Hangfire.
- Cache, health checks, logging, tracing/metrics và SEO cho nội dung công khai.

Ngoài phạm vi v1.0.0: bình luận và đánh giá sao, yêu thích/bookmark, thông báo real-time (SignalR/WebSocket), ứng dụng native iOS/Android, thanh toán/thương mại điện tử, nhắn tin trực tiếp giữa người dùng và GraphQL API.

### 1.2. Vai trò và quyền

| Vai trò | Điều kiện | Quyền |
| --- | --- | --- |
| Guest | Không cần tài khoản | Xem/tìm kiếm công thức `Published`, xem danh mục. |
| Author | Đã xác thực; được gán sau đăng ký | Toàn bộ quyền Guest; tạo, sửa, xóa, publish/archive recipe thuộc sở hữu; quản lý ảnh, nguyên liệu, bước. |
| Admin | Role `Admin` được seed/gán thủ công | Toàn bộ quyền Author; CRUD category; sửa/xóa mọi recipe; xem Hangfire Dashboard và logs. |

Phân quyền gồm ba lớp: role-based (`Author`, `Admin`), resource-based (Author chỉ thao tác recipe có `AuthorId == currentUserId`) và policy-based (`VerifiedAuthor` yêu cầu email được xác nhận). Admin bypass kiểm tra ownership.

## 2. Nghiệp vụ và quy tắc miền

### 2.1. Vòng đời công thức

```text
Create ──> Draft ──publish──> Published ──unpublish──> Draft
                 └─archive──> Archived
Published ──archive──> Archived
Draft | Published | Archived ──delete──> removed (xem điểm mâu thuẫn về hard/soft delete)
```

- Recipe mới luôn ở trạng thái `Draft`; slug sinh từ title, URL-friendly và duy nhất.
- `Published` hiển thị công khai, được tìm kiếm và đưa vào sitemap/index SEO.
- `Draft` và `Archived` chỉ chủ sở hữu hoặc Admin xem được; `Archived` bị ẩn khỏi danh sách công khai nhưng không bị xóa theo mô tả archive.
- Publish/unpublish là idempotent khi recipe đã ở trạng thái đích.
- SRS mô tả recipe phải có tối thiểu một bước để publish; bảng lỗi lại yêu cầu cả ít nhất một ingredient và một step. SPEC bảo lưu cả hai diễn giải tại phần 8.
- Recipe update dùng optimistic concurrency. Client gửi `RowVersion` qua `If-Match` hoặc request body; xung đột trả lỗi concurrency.
- Recipe aggregate bao gồm `RecipeStep`, `RecipeIngredient`, `RecipeImage` và owned entity `RecipeNutrition`; mutation đi qua Unit of Work/transaction.

### 2.2. Danh mục

- Category chỉ do Admin tạo/sửa/xóa. Guest và Author chỉ đọc.
- `Name` và `Slug` là duy nhất. Slug được sinh từ name theo lower-case, bỏ dấu và thay khoảng trắng bằng `-`; khi trùng thì thêm suffix số.
- Đổi name không đổi slug để bảo toàn URL SEO.
- Không được xóa category còn chứa recipe ở bất kỳ trạng thái nào; trả `409 Conflict` kèm số lượng recipe.
- Danh sách category có số recipe `Published`, sắp xếp name tăng dần và được cache. Mọi mutation category invalidate cache.

### 2.3. Recipe con và ảnh

- Ingredient có tên, số lượng, đơn vị, ghi chú, thứ tự hiển thị; SRS mô tả validation Name 1–100, Quantity > 0 và Unit bắt buộc ở FR-RCP-009 nhưng data model/API cho phép quantity/unit nullable.
- Step có thứ tự liên tục. Khi thêm, số bước tự tăng; khi xóa, các bước còn lại phải renumber 1, 2, 3… . Data model còn có `Title`, `TimerMinutes`, `ImageUrl`.
- Upload ảnh dùng `multipart/form-data`; chỉ JPEG/PNG/WebP/AVIF, tối đa 5 MB, đồng thời kiểm tra MIME và magic bytes. Tên object dùng GUID tại `recipes/{recipeId}/...` để chống path traversal.
- Ảnh đầu tiên mặc định `IsPrimary=true`. Khi đặt ảnh chính, các ảnh khác chuyển `false`; khi xóa primary và còn ảnh khác, ảnh còn lại đầu tiên trở thành primary.
- Ảnh gốc lưu MinIO; background job tạo medium 800×600 và thumbnail 300×300. Xóa ảnh/file được thực hiện bất đồng bộ và retry.

### 2.4. Xác thực và tài khoản

- Đăng ký email/password tạo user role `Author`; email không trùng, password tối thiểu 8 ký tự gồm hoa, thường, số và ký tự đặc biệt.
- Login sai không tiết lộ email có tồn tại; sau 5 lần sai account lockout 15 phút.
- Access token JWT HS256 có TTL 15 phút, gồm userId/email/roles/jti. Refresh token có TTL 7 ngày, random crypto 128-bit, chỉ lưu SHA-256 hash.
- Refresh bắt buộc rotation: token cũ bị revoke, ghi `RevokedAt`/`ReplacedByTokenHash`, rồi cấp cặp token mới. Reuse token đã revoke là security alert; SRS cho phép revoke toàn bộ token family.
- Logout revoke refresh token thuộc current user và có tính idempotent nếu token không tồn tại.
- Google OAuth tạo user Author ở lần đầu, hoặc link external login với tài khoản có cùng email. Scope: `openid email profile`; luồng nguồn có cả Authorization Code + PKCE/Auth.js và gửi `idToken`, được ghi nhận là mâu thuẫn.
- Profile chỉ cập nhật các trường được cho phép; password hash và security stamp không bao giờ trả về API.

### 2.5. Đọc, tìm kiếm, lọc

- Guest chỉ nhận `Published`; Author nhận `Published` cộng Draft/Archived của chính mình theo FR-RCP-001; Admin nhận mọi trạng thái.
- Category detail trả Published và có thể kèm Draft của current Author.
- Tìm kiếm toàn văn chỉ trả Published recipe, query tối thiểu 2 ký tự, dùng PostgreSQL `tsvector`/`tsquery`, `ts_rank`, prefix matching và `unaccent` để hỗ trợ tiếng Việt không dấu.
- Filter kết hợp bằng AND: `categoryId`, `difficulty`, `maxCookTime`, `minServings`. Default sort là `-createdAt`; `-` là descending.
- Phân trang offset: page mặc định 1, pageSize mặc định 12 (một số bảng API ghi 10), tối đa 50. Response có items, tổng số, tổng trang và cờ trang trước/sau.

### 2.6. Jobs và quan sát

| Job | Trigger | Hành vi | Retry |
| --- | --- | --- | --- |
| Welcome email | Sau đăng ký | Gửi HTML email qua SMTP/MailKit | 3 lần, exponential backoff 1/5/30 phút |
| Image resize | Sau upload ảnh | Sinh medium + thumbnail, cập nhật URL DB | 3 lần; ảnh gốc vẫn dùng được nếu thất bại |
| Sitemap | 02:00 UTC mỗi ngày | Sinh sitemap Published recipe/category/static page, upload/lưu và ping Google | 2 lần |
| File delete | Sau xóa image/recipe | Xóa object MinIO idempotent | tối đa 3 lần |

Health endpoints: `/health` kiểm tra dependency; `/health/live` chỉ process; `/health/ready` kiểm tra DB + Redis. Mỗi request phải có `X-Correlation-ID` (tự sinh nếu thiếu), được phản hồi lại và đưa vào Serilog logs cùng path/status/elapsed/UserId. OpenTelemetry theo dõi HTTP, EF Core, custom metrics và trace correlation.

## 3. Kiến trúc kỹ thuật

### 3.1. Bức tranh triển khai

```text
Browser/Mobile
       │ HTTPS
       ▼
 Next.js 14+ App Router ───── REST/JSON ──── .NET 10 Minimal API
       │                                             │
       └────────────── Nginx (TLS, proxy, rate limit, static cache)
                                                     │
         ┌─────────────────────┬─────────────────────┼───────────────────┐
         ▼                     ▼                     ▼                   ▼
 PostgreSQL 16             Redis 7            MinIO (S3)          Hangfire/SMTP/
 (EF Core, FTS)          (cache/rate)      (recipe images)       Google/OTel/Seq
```

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, Auth.js v5, TanStack Query, React Hook Form và Zod. `/`/category/recipe public dùng ISR; list/search SSR; auth/dashboard/profile CSR.
- Backend: ASP.NET Core .NET 10 Minimal APIs, không dùng MVC controllers; base route `/api/v1`; Scalar/OpenAPI tại `/scalar`.
- Nginx làm reverse proxy, SSL termination, static cache/rate limiting và có thể load-balance nhiều API instance.
- Docker Compose chạy frontend/API/PostgreSQL/Redis/MinIO cùng service quan sát trong dev; production triển khai Docker, Nginx và managed/VPS dependencies.

### 3.2. Clean Architecture

| Layer | Trách nhiệm | Phụ thuộc cho phép |
| --- | --- | --- |
| Domain | Entity/value object/enums/domain rule/repository abstraction: `Recipe`, `Category`, users, children, `RecipeNutrition`, `Slug`, `EmailAddress` | .NET BCL; SRS yêu cầu không phụ thuộc Infrastructure/Application. |
| Application | CQRS commands/queries/handlers, DTO, FluentValidation, pipeline behaviors, service interfaces và authorization orchestration | Domain. |
| Infrastructure | EF Core DbContext/configuration/migrations/repositories; JWT, MinIO/S3, MailKit, Redis, Hangfire, audit interceptor | Application (implements abstractions). |
| Presentation/API | Minimal endpoint groups, DI, auth, middleware, OpenAPI, response mapping | Application + composition of Infrastructure. |

Dependency Rule: dependency chỉ hướng vào trong; Domain/Application không reference Infrastructure. SRS nêu mâu thuẫn nhỏ khi vừa “Domain không NuGet dependency” vừa liệt kê FluentValidation trong điều kiện compliance — giữ nguyên như nguồn.

### 3.3. CQRS/MediatR request flow

```text
HTTP endpoint → Authentication/Authorization → MediatR
  → LoggingBehavior → ValidationBehavior → CachingBehavior (query ICacheable)
  → IRequestHandler → CacheInvalidationBehavior (successful mutating command)
  → DTO / RFC 7807 Problem Details
```

Validation phải nằm ở FluentValidation + MediatR pipeline, không nằm trong endpoint handler. Handler gọi repository/service abstraction; EF Core Unit of Work commit trong transaction. Exception middleware chuyển lỗi thành RFC 7807 và không lộ stack trace.

### 3.4. Caching, resilience, security

- Cache chính: Redis distributed cache/cache-aside; output cache cho recipe lists/details; SRS cũng nêu `IMemoryCache` cho category. Key/tag cache recipe phải bị invalidate sau create/update/delete/publish/archive và mutation child.
- Redis unavailable phải fallback database thay vì làm lỗi request. MinIO unavailable khi upload trả `503`; job lỗi được retry không ảnh hưởng response delete thành công.
- Rate limits: auth 10 req/phút/IP, API chung 100, upload 5; response `429` có `Retry-After`.
- HTTPS TLS 1.2+, HSTS, CORS theo configured origins, CSP/XSS sanitation, EF Core parameterization, secrets bằng User Secrets (dev) hoặc environment variables (prod).

## 4. Mô hình dữ liệu

Mọi entity nghiệp vụ kế thừa `BaseEntity`: `Id`, `CreatedAt`, `UpdatedAt`, `IsDeleted`, `RowVersion`; PostgreSQL/EF Core Code First dùng UUID cho entity nghiệp vụ và ASP.NET Identity string ID cho user.

| Entity | Thuộc tính/quan hệ cốt lõi | Ràng buộc quan trọng |
| --- | --- | --- |
| Recipe | Title, Slug, Description, Instructions, PrepTime, CookTime, Servings, Difficulty, Status, CategoryId, AuthorId, SearchVector, PublishedAt; 1:N steps/ingredients/images; owned nutrition | Slug unique; Category `RESTRICT`; child cascade; title 5–200; prep > 0, cook >= 0, servings > 0. |
| RecipeNutrition | Calories, Protein, Carbohydrates, Fat, Fiber, Sodium | Owned; các cột `Nutrition_*` trong `Recipes`; nullable decimal. |
| RecipeStep | RecipeId, StepNumber, Title, Description, TimerMinutes, ImageUrl | FK cascade; StepNumber > 0, unique theo recipe. |
| RecipeIngredient | RecipeId, Name, Quantity, Unit, Notes, OrderIndex | FK cascade; Name required; source mâu thuẫn về nullable quantity/unit. |
| RecipeImage | RecipeId, OriginalUrl, MediumUrl, ThumbnailUrl, AltText, IsPrimary, OrderIndex | FK cascade; chỉ một primary/recipe là invariant nghiệp vụ. |
| Category | Name, Slug, Description, ImageUrl, OrderIndex | Name/Slug unique; không delete khi có recipe. |
| ApplicationUser | ASP.NET `IdentityUser<string>` + DisplayName, AvatarUrl, Bio, IsActive, CreatedAt | Identity password/lockout; role Author mặc định. |
| RefreshToken | UserId, TokenHash, ExpiresAt, RevokedAt, ReplacedByTokenHash, CreatedAt, CreatedByIp | TokenHash SHA-256 unique; FK user cascade. |

`SearchVector` là PostgreSQL `tsvector` có GIN index và được trigger cập nhật khi `Title`/`Description` đổi. Extensions bắt buộc: `unaccent`, `pg_trgm`. B-tree index cho slug, status, difficulty, category, author, publish time và các truy vấn/sort chính.

## 5. Hợp đồng giao diện/API

### 5.1. Quy ước chung

- Base URL dev: `http://localhost:5000/api/v1`; production: `https://api.culinaryblog.com/api/v1`.
- Request/response JSON UTF-8; upload dùng `multipart/form-data`; access token đặt trong `Authorization: Bearer <token>`; refresh token ở request body.
- SRS nêu cả raw DTO và success envelope `{ data, meta }`; lỗi dùng `application/problem+json`, RFC 7807: `{ type, title, status, detail, errors }`.
- Versioning bằng URL path. Breaking change đi `/api/v2`; v1 giữ tối thiểu 6 tháng.

### 5.2. Endpoint summary

| Nhóm | Endpoint | Quyền | Chức năng |
| --- | --- | --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh` | Public | Đăng ký, đăng nhập, Google login, refresh. |
| Auth | `POST /auth/logout`; `GET/PATCH /auth/me` | Bearer | Đăng xuất, đọc/cập nhật profile. |
| Category | `GET /categories`, `GET /categories/{slug}` | Public | Danh sách và category detail/paginated recipes. |
| Category | `POST /categories`, `PUT/DELETE /categories/{id}` | Admin | CRUD danh mục. |
| Recipe | `GET /recipes`, `GET /recipes/{slug}`, `GET /recipes/search` | Public có visibility filter | List/detail/search. |
| Recipe | `POST /recipes`; `PUT/DELETE /recipes/{id}` | Author owner/Admin | Tạo/sửa/xóa recipe. |
| Recipe state | `PATCH /recipes/{id}/publish`, `/unpublish`, `/archive` | Author owner/Admin | Chuyển trạng thái. |
| Image | `POST /recipes/{id}/images`; `PATCH/DELETE /recipes/{id}/images/{imageId}` | Author owner/Admin | Upload/update metadata/xóa ảnh. |
| Step | `POST /recipes/{id}/steps`; `PUT/DELETE /recipes/{id}/steps/{stepId}` | Author owner/Admin | CRUD step. |
| Ingredient | `POST /recipes/{id}/ingredients`; `PUT/DELETE /recipes/{id}/ingredients/{ingId}` | Author owner/Admin | CRUD ingredient. |
| Operations | `GET /health`, `/health/live`, `/health/ready` | Public/infrastructure | Health/readiness/liveness. |

Các status được SRS dùng: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`. Application error code tiêu biểu: `AUTH_EMAIL_EXISTS`, `AUTH_INVALID_CREDENTIALS`, `AUTH_REFRESH_TOKEN_EXPIRED`, `AUTH_REFRESH_TOKEN_REVOKED`, `RECIPE_NOT_FOUND`, `RECIPE_PUBLISH_INCOMPLETE`, `RECIPE_FORBIDDEN`, `RECIPE_CONCURRENCY_CONFLICT`, `CATEGORY_DELETE_HAS_RECIPES`, `FILE_SIZE_EXCEEDED`, `FILE_MIME_INVALID`, `VALIDATION_ERROR`, `RATE_LIMIT_EXCEEDED`.

## 6. Yêu cầu chất lượng và UI

| Lĩnh vực | Tiêu chí SRS |
| --- | --- |
| Performance | GET cache warm p50 <= 150 ms; all API p95 <= 500 ms, p99 <= 1 s; >=100 concurrent users trên 2 vCPU/4 GB; cache hit >=80%. |
| Frontend | LCP <=2.5 s, CLS <=0.1, INP <=200 ms, initial JS gzip <=200 KB; ISR, `next/image`, code splitting. |
| Accessibility/UI | Tailwind responsive: mobile 320–767, tablet 768–1199, desktop >=1200; WCAG 2.1 AA; keyboard and screen-reader support; loading skeleton/progress/toast/optimistic rollback. |
| Reliability | Uptime >=99.5%; graceful exception handling; 30 s DB timeout; persistent volumes; daily `pg_dump` 03:00, retention 30 days. |
| Maintainability | Static analysis/no warnings; >=80% backend unit coverage; integration happy+error every endpoint; 5 E2E critical flows; README, Scalar, ADR, CHANGELOG. |
| Scale | Stateless API/JWT; Redis shared cache; multi-worker Hangfire; Nginx API pool; optional read replica/partition/CDN/MinIO distributed mode. |
| SEO | Recipe JSON-LD, metadata/Open Graph/canonical, sitemap/robots, published index/follow vs draft/archive noindex, slug URL patterns. |

Các route UI: public `/`, `/recipes`, `/recipes/[slug]`, `/categories`, `/categories/[slug]`, `/search`; auth `/auth/login`, `/auth/register`; authenticated `/dashboard`, `/dashboard/recipes`, `/dashboard/recipes/new`, `/dashboard/recipes/[id]/edit`, `/dashboard/categories`, `/profile`.

## 7. Kiểm thử chấp nhận và truy vết

Tối thiểu phải kiểm thử các tình huống sau:

1. Đăng ký thành công tạo Author và enqueue email; email trùng, mật khẩu sai, lockout và rate-limit trả lỗi đúng.
2. Login/refresh/logout: TTL, rotation, token đã revoke/reuse, user bị khóa/xóa và logout idempotent.
3. Guest không thể xem Draft/Archived hoặc mutation; Author khác không thể thao tác recipe không sở hữu; Admin có bypass phù hợp.
4. Recipe mới là Draft; publish đáp ứng business precondition; unpublish/archive idempotent; update conflict `RowVersion`; delete xử lý child/file job/cache theo SRS.
5. Category uniqueness, stable slug on rename, delete blocked khi còn recipe, cache invalidation.
6. File invalid MIME/magic bytes/size, primary image switching/fallback, retry khi MinIO/job lỗi.
7. Step renumber sau delete; ingredient/step/image CRUD ownership và validation.
8. FTS tiếng Việt không dấu, visibility, filter AND, sort và boundary pagination.
9. RFC 7807/error codes, correlation ID, health readiness và fallback khi Redis unavailable.
10. SSR/ISR/CSR routes, responsive/a11y, JSON-LD/meta/sitemap và NFR performance targets.

## 8. Điểm chưa nhất quán trong SRS (bảo lưu nguyên trạng)

| Chủ đề | Quy định xuất hiện trong SRS | Mâu thuẫn/tác động cần quyết định trước implementation |
| --- | --- | --- |
| Publish precondition | FR-RCP-005 yêu cầu `Steps.Count > 0`. `RECIPE_PUBLISH_INCOMPLETE` yêu cầu ít nhất 1 ingredient **và** 1 step. | Không thể đồng thời xác định hợp lệ khi recipe chỉ có step. |
| Recipe deletion | FR-RCP-007 mô tả hard delete + cascade và xóa file async. API table ghi soft delete; NFR-REL-003 cũng nói Recipe `IsDeleted=true`. | Cần chọn hard delete hoặc soft delete, lifecycle restore và query filter. |
| Category deletion | FR-CAT-005 mô tả xóa entity; API table gọi soft delete. | Cần xác định physical removal hoặc `IsDeleted`. |
| HTTP validation/concurrency | Nhiều FR dùng validation `422`, Appendix A/B ghi `400` validation; FR-RCP-004 dùng concurrency `409`, Appendix B gán `422`. | Client không thể dựa vào status duy nhất nếu không chốt contract. |
| OAuth protocol/callback | FR-AUTH-003: Authorization Code + PKCE, callback Next.js/Auth.js; external-interface table: callback API; API table nhận `{ idToken }`. | Cần chọn ownership callback/token verification phía frontend hay backend. |
| Cache implementation/TTL | FR-CAT dùng IMemoryCache 60 phút; FR-RCP Output Cache 15/60 phút; NFR-PERF dùng Redis (category 30 phút/detail 5/search 1); NFR-SCALE cấm IMemoryCache shared state. | Cần thống nhất Redis/output/memory, TTL, key/tag và invalidation. |
| API response shape | §5.2 nêu success wrapper `{data, meta}`; các FR/API table nêu raw `Dto`, array hoặc `PagedResult`. | Frontend/OpenAPI không thể codegen chính xác trước khi chọn wrapper. |
| Profile fields | FR-AUTH-007 nói `FullName`, `AvatarUrl`; API table dùng `DisplayName`, `AvatarUrl`, `Bio`; user model có DisplayName/Bio. | Cần chốt payload/profile naming và Bio có được cập nhật không. |
| Recipe/child DTO fields | FR step tự đánh số và nêu `DurationMinutes`; API nêu client `stepNumber`, `title`, `timerMinutes`. Ingredient FR yêu cầu quantity/unit nhưng data/API nullable. | Cần thống nhất request schema và validation. |
| Slug collision | FR create recipe trả `409` khi slug tồn tại; Appendix mô tả tự thêm suffix (`slug-1`, `slug-2`). | Cần chọn reject hay generated suffix. |

## 9. Hạ tầng và cấu hình tối thiểu

- Production tối thiểu: Ubuntu 22.04/Debian 12, 2 vCPU, 4 GB RAM, 20 GB SSD; khuyến nghị 4 vCPU, 8 GB RAM, 50 GB SSD. PostgreSQL 16, Redis 7, MinIO, Docker Compose, Nginx.
- Dev: .NET 10 SDK, Node.js 20+ / npm 10+, Docker Desktop/Engine, Postman hoặc Scalar. Seed dự kiến 50 recipe, 5 author bằng Bogus.
- Secrets không commit Git: JWT key, Google credentials, MinIO access/secret, SMTP credentials, Seq/OTel endpoint. Production dùng environment variables; development dùng User Secrets.
