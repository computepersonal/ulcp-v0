# media-service — Agent Context

> This file is the living knowledge base for the media-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Single image upload (POST /api/v1/media/upload)
- Multiple image upload up to 5 files (POST /api/v1/media/upload/multiple)
- File deletion — all 3 size variants (DELETE /api/v1/media/:tenant_id/*)
- Sharp image processing pipeline: resize to 3 sizes then WebP convert
  - thumb: 150×150 cover, quality 80
  - medium: 600×600 inside, quality 85
  - full: 1200×1200 inside, quality 90
- Cloudflare R2 storage in production (S3-compatible via @aws-sdk/client-s3)
- Local filesystem in DEV_MODE (uploads/ directory, served via @fastify/static)
- Supported formats: JPEG, JPG, PNG, WebP, GIF (validated via magic bytes)
- Max file size: 10MB
- Stream-based multipart handling (no temp files for single upload)

## No Database
Stateless — files in R2 (prod) or local volume (dev).

## Key Routes
```
POST   /api/v1/media/upload           ← Bearer JWT or X-Internal-Secret
POST   /api/v1/media/upload/multiple  ← Bearer JWT or X-Internal-Secret (max 5)
DELETE /api/v1/media/:tenant_id/*     ← Bearer JWT (owner only)
GET    /uploads/:tenant_id/:filename  ← DEV_MODE only (served by @fastify/static)
```

## Upload Response Shape
```json
{
  "success": true,
  "data": {
    "key": "tenantId/uuid",
    "thumb": "http://...",
    "medium": "http://...",
    "full": "http://..."
  }
}
```

## Known Issues / Gotchas
- Sharp native bindings must match Node.js version — if Sharp errors after node upgrade, run `pnpm rebuild sharp`
- In DEV_MODE=true: files stored at `uploads/{tenant_id}/{uuid}-{size}.webp` relative to service root
- @fastify/multipart v8 (Fastify v4 compatible) — was v9 before downgrade
- @fastify/static v7 (Fastify v4 compatible) — was v9 before downgrade
- Fastify v4 (downgraded from v5 during 2026-04-16 audit)
- Zod v3 (matches all other services on Fastify v4)

## Recent Changes
- 2026-04-16: Fastify downgraded v5→v4 (TypeScript audit fix)
- 2026-04-16: @fastify/multipart downgraded v9→v8 (Fastify v4 compatible)
- 2026-04-16: @fastify/static downgraded v9→v7 (Fastify v4 compatible)
- 2026-04-16: Zod downgraded v4→v3

## Environment
- Dev port: 3010
- No database (R2 / local filesystem)
- DEV_MODE=true in docker-compose.dev.yml
- Fastify v4, @fastify/multipart v8, @fastify/static v7

## How to Run Locally
```bash
cd services/media-service
pnpm dev
# Test upload:
# curl -X POST http://localhost:3010/api/v1/media/upload \
#   -H "Authorization: Bearer {token}" \
#   -F "file=@test.jpg"
# Returns: { success: true, data: { thumb, medium, full, key } }
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up media-service
docker compose -f docker-compose.dev.yml logs -f media-service
```

## Dependencies on Other Services
- Called by: catalogue-service (image upload in catalogue builder), tenant-service (logo/cover)
- No outbound calls to other services

## Pending / TODO
- Video upload support (for CatalogueItem.video_url field)
- CDN URL generation for production R2 URLs (custom domain via Cloudflare)
- Image optimization testing (verify WebP quality/size tradeoff)
- Unit tests for imageProcessor.ts
