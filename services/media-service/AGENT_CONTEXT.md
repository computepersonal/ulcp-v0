# media-service — Agent Context

> This file is the living knowledge base for the media-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Single image upload (POST /api/v1/media/upload)
- Multiple image upload (POST /api/v1/media/upload/multiple)
- File deletion (DELETE /api/v1/media/:filename)
- Sharp image processing pipeline (resize to 3 sizes: thumb/medium/full)
- WebP conversion (quality: 85)
- Cloudflare R2 storage (S3-compatible)
- Local filesystem fallback in DEV_MODE
- Docker volume for local uploads: media_uploads

## No Database
Stateless — files in R2 (prod) or local volume (dev).

## Known Issues / Gotchas
- Sharp must match Node.js version — if Sharp errors after node upgrade, run `pnpm rebuild sharp`
- In DEV_MODE=true: files stored at /app/uploads in container (mapped to media_uploads Docker volume)
- Max file size: check Fastify body limit config — should be 10MB+
- File type validation: validate via magic bytes, not just extension

## Recent Changes
- Service fully built (port 3010)
- DEV_MODE local storage working
- Three sizes (thumb 150px, medium 600px, full 1200px) all WebP

## Environment
- Dev port: 3010
- No database (R2/filesystem only)
- DEV_MODE=true in docker-compose.dev.yml

## How to Run Locally
```bash
cd services/media-service
pnpm dev
# Test upload:
# curl -X POST http://localhost:3010/api/v1/media/upload \
#   -H "Authorization: Bearer {token}" \
#   -F "file=@test.jpg"
# Returns: { success: true, data: { thumb, medium, full } }
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up media-service
docker compose -f docker-compose.dev.yml logs -f media-service
```

## Pending / TODO
- Video upload support (for item video_url field)
- CDN URL generation for production R2 URLs
- Image optimization testing (verify WebP quality/size tradeoff)
- Unit tests for imageProcessor.ts
