# apps — Frontend Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains shared frontend domain knowledge across all apps.
> App-specific screen designs are in each app's own CLAUDE.md.

---

## UI/UX DESIGN SYSTEM

Philosophy: Professional enterprise SaaS (Linear + Stripe + Vercel feel)

### Colors

```
Brand:   #6366F1 primary, #4F46E5 hover, #818CF8 dark mode
Page bg: #F9FAFB light / #0F1117 dark
Card:    #FFFFFF light / #1A1F2E dark
Border:  #E5E7EB light / #252B3B dark
Success: #10B981 | Warning: #F59E0B | Error: #EF4444
```

### Typography

```
Primary: Inter (variable font)
Mono:    JetBrains Mono (prices, codes, IDs)
Scale:   12/14/16/18/20/24/30/36px
Weights: 400/500/600/700
```

### Layout

```
Desktop: 240px sidebar + max-1280px content
Mobile:  full width, 16px margins
Breakpoint: 1024px
```

### Components

```
Buttons: primary/secondary/ghost/danger/icon
Inputs:  text/select/toggle/checkbox (all states)
Cards:   base/interactive/selected/metric
Badges:  status/plan type
```

Dark Mode: CSS variables (:root vs .dark), localStorage persisted
Animations: 200–250ms ease-out throughout, floating cart slide-up

---

## STATE MANAGEMENT

### Four Layers

1. Redux (in-memory) → current session, real-time
2. AsyncStorage/localStorage → persistent across sessions
3. Redis (server-side) → shared across all users
4. PostgreSQL → source of truth

### What's Persisted

**Customer app (AsyncStorage):**
auth, catalogue (5min stale), cart (never lose),
orderHistory (10min), loyalty (5min), wishlist, recentlyViewed

**Staff web (localStorage):**
auth, tenantConfig (30min), catalogue (5min)
NOT: tables, activeOrders, KOTs (always from Socket.io)

**KDS:** localStorage config only. All KOT state from Socket.io.

### Key Patterns

- Stale-while-revalidate: serve instantly, refresh in background
- RTK Query: keepUnusedDataFor 300 (catalogue), 60 (search), 0 (payments)
- Mutations auto-invalidate cache tags
- baseQueryWithRefresh: mutex-protected silent token refresh

---

## FRONTEND PERFORMANCE TARGETS

```
customer-web:  <150KB gzipped
staff-web:     <300KB gzipped
kds-app:       <100KB gzipped
```

- All routes: React.lazy() code splitting
- All images: lazy-loaded, WebP from Cloudflare CDN
- customer-web: PWA service worker for offline catalogue browsing
