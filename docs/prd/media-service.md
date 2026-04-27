# media-service — PRD

## Overview

The media-service (port 3010) handles all image uploads and processing for the ULCP platform. When any service or frontend needs to store an image (catalogue item photos, tenant logos, cover images, ad creatives, etc.), it uploads to this service. The service accepts the original file, converts it to WebP at three standard sizes (thumbnail, medium, full), and persists the result either to local disk in development or to Cloudflare R2 in production. It returns CDN-ready URLs for all three sizes. The service also provides a link preview scraping endpoint for Open Graph metadata.

---

## Users / Actors

- **Staff (tenant users)** — upload images via the staff POS web app when managing catalogue items, setting tenant logo/cover, etc. Authenticated via Bearer JWT.
- **Other services (internal)** — call the upload endpoint via `X-Internal-Secret` header (e.g., ads-service uploading ad creatives, procurement-service attaching vendor files)
- **System (dev mode)** — file retrieval via `GET /uploads/` static file serving; in production, files are served directly from Cloudflare CDN and this service is not in the read path

---

## Core Features

1. **Single image upload** — accepts one file via multipart/form-data, validates type and size, processes to three WebP variants, saves to storage, and returns three URLs
2. **Multiple image upload** — accepts up to 5 files in a single request, processes each independently, returns an array of results
3. **Image processing pipeline** — converts any accepted input format to WebP at three sizes:
   - Thumb: 150×150 pixels, cover fit, quality 80
   - Medium: 600×600 pixels, inside fit (preserves aspect ratio), quality 85
   - Full: 1200×1200 pixels, inside fit, quality 90
4. **Dual storage backend** — local filesystem for development (`DEV_MODE=true` or when R2 env vars are absent), Cloudflare R2 (S3-compatible) for production
5. **File deletion** — deletes all three size variants atomically given a tenant_id and storage key
6. **Link preview scraping** — fetches a URL, extracts Open Graph tags (title, description, image), caches result in Redis for 1 hour; includes SSRF protection against private IP ranges
7. **Dev file serving** — static route serves uploaded files from local disk so development works without a CDN

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/media/upload` | X-Internal-Secret or Bearer JWT | Upload one image; returns thumb/medium/full URLs + storage key |
| POST | `/api/v1/media/upload/multiple` | X-Internal-Secret or Bearer JWT | Upload up to 5 images; returns array of results |
| DELETE | `/api/v1/media/:tenant_id/*` | X-Internal-Secret or Bearer JWT | Delete all 3 variants for the given key |
| GET | `/api/v1/media/link-preview?url=` | None (open) | Scrape OG metadata for a URL (SSRF-protected, Redis-cached 1h) |
| GET | `/uploads/:tenant_id/:filename` | None | Serve local file (dev mode only, via @fastify/static) |
| GET | `/health` | None | Service health + storage mode indicator |

**Upload request format (single):** multipart/form-data with fields:
- `file` (required) — the image file
- `tenant_id` (required) — can also be passed as query string `?tenant_id=`
- `category` (optional) — used as a path prefix in storage (e.g., `items`, `logos`, `ads`)

**Upload response:**
```json
{
  "success": true,
  "data": {
    "key": "tenant_abc/items/uuid",
    "thumb_url": "https://cdn.../tenant_abc/items/uuid-thumb.webp",
    "medium_url": "https://cdn.../tenant_abc/items/uuid-medium.webp",
    "full_url": "https://cdn.../tenant_abc/items/uuid-full.webp",
    "size_bytes": 45231,
    "format": "webp",
    "original_filename": "pizza.jpg"
  }
}
```

---

## Data Models

The media-service has no Prisma schema and no database. It is a stateless processing service. Persistence is entirely in the storage backend (local filesystem or Cloudflare R2).

**Storage key structure:** `{tenant_id}/{category}/{uuid}` (category is optional)
**File variants stored:** `{key}-thumb.webp`, `{key}-medium.webp`, `{key}-full.webp`

**Redis usage:**
- Link preview cache: key `link_preview:{base64(url, first 50 chars)}`, TTL 3600 seconds
- Redis is connected but not used for image upload/delete operations

---

## Business Rules

- **Authentication:** All upload and delete routes require either a valid `X-Internal-Secret` header (for service-to-service calls) or a valid `Bearer` JWT token (for direct staff uploads). Link preview is open.
- **File size limit:** 10MB per file, enforced at both the multipart plugin level and in the route handler
- **Accepted input formats:** JPEG, JPG, PNG, WebP, GIF — anything else returns 400
- **Multiple upload cap:** Maximum 5 files per request; excess files beyond 5 are silently discarded (stream consumed to avoid backpressure)
- **Storage key uniqueness:** UUID v4 generated per upload — collisions are statistically impossible but no de-duplication is performed; every upload creates new files
- **Dev vs prod storage:** Determined by presence of `CLOUDFLARE_R2_BUCKET` env var or `DEV_MODE=true`. In dev, URLs point to `http://localhost:3010/uploads/...`; in prod, URLs point to `{CDN_DOMAIN}/{key}` (configurable via `CDN_DOMAIN` env var, defaults to `https://{bucket}.r2.dev`)
- **Deletion is best-effort:** Uses `Promise.allSettled()` — if one size variant fails to delete (e.g., already gone), the others still proceed and a 200 is returned
- **SSRF protection on link preview:** Blocks localhost, 127.x, 10.x, 192.168.x, and 172.16-31.x address ranges
- **Link preview timeout:** 5-second fetch timeout via `AbortSignal.timeout(5000)`; on failure, returns graceful fallback `{ title: url, description: "", image_url: "" }` rather than an error

---

## Service Dependencies

| Dependency | Direction | Purpose |
|------------|-----------|---------|
| Cloudflare R2 (prod) | Write/Delete | Primary image storage via S3-compatible API |
| Local filesystem (dev) | Write/Delete/Read | Dev-mode substitute for R2 |
| Redis | Read/Write | Link preview cache (1h TTL) |
| Other services (callers) | Inbound | Any service needing image storage calls this service |

The media-service does not call any other ULCP services. It is called by: catalogue-service (item images), tenant-service (logos, covers), ads-service (ad creatives), and directly by the staff POS frontend.

---

## Current Build Status

| Component | Status |
|-----------|--------|
| `src/index.ts` | Built and working |
| `src/lib/imageProcessor.ts` | Built — Sharp-based, 3-size WebP pipeline |
| `src/lib/storage.ts` | Built — dual local/R2 backend |
| `src/lib/redis.ts` | Built — ioredis connection |
| `src/lib/logger.ts` | Built — Pino logger |
| `src/routes/media.routes.ts` | Built — upload single, upload multiple, delete, link-preview |
| Prisma schema | Not applicable (no database) |
| Dockerfile | Exists — includes `vips`/`libvips` for Alpine (required by Sharp) |
| Swagger docs | Registered at `/docs` |
| Health check | Returns storage mode ("local" or "cloudflare-r2") |

The media-service is **fully implemented and production-ready**. No features are stubbed.

---

## Open Questions / Gaps

1. **No media record keeping**: The service stores no metadata about uploaded files (who uploaded, when, which entity it belongs to). If a catalogue item is deleted, nothing automatically cleans up its images in R2. Should there be a cleanup mechanism, or is this acceptable (orphaned files accumulate in R2)?
2. **Cloudflare cache invalidation**: Images are served from R2/CDN with `Cache-Control: public, max-age=31536000` (1 year). If a tenant updates their logo, the new image gets a new UUID-based key, which is correct. But if the same key were ever reused (which it cannot be currently), cache invalidation would be needed. Is the current UUID-per-upload approach sufficient, or do callers need to update all references when replacing an image?
3. **Video support**: The CLAUDE.md mentions `video_url` as a field on catalogue items. The media-service currently only handles images. Is video upload/processing planned for this service, or will video URLs be external links only?
4. **GIF handling**: GIF files are accepted and accepted, but Sharp converts them to a single static WebP frame (no animation). Should animated GIFs be preserved, rejected, or converted to WebP animations?
5. **CDN domain configuration**: The `CDN_DOMAIN` env var is documented internally but not in the root CLAUDE.md. Should this be moved to a shared environment config?
6. **Rate limiting on uploads**: The service has no per-tenant upload rate limiting. High-volume tenants could exhaust R2 write quotas. Is this a concern at current scale?
7. **Link preview in production**: The `GET /api/v1/media/link-preview` endpoint has no authentication. Is this intentional (public utility for all clients) or should it be restricted?
8. **`category` field validation**: The `category` path segment in the storage key is accepted as a free-form string with no validation. A malicious or misconfigured caller could craft unusual storage paths. Should this be an allowlist (e.g., `items`, `logos`, `ads`, `covers`)?
