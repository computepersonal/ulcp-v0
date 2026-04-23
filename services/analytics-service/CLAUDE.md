# analytics-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains analytics-service-specific domain knowledge only.

---

## REAL-TIME DASHBOARD (Pro+)

Live metrics broadcast via Socket.io every 30s:
revenue, active orders, tables, deliveries

### Charts

- Revenue trend
- Top items
- Category revenue
- Peak hours heatmap
- Order type donut
- Payment mode donut
- AOV (Average Order Value) trend

### Customer Insights

- New vs returning customers
- Retention rate
- Top spenders

### Staff Performance

Orders handled per staff member

### P&L Statement

revenue − COGS (from StockMovement × unitCost) − commission − subscription

### Exports

- PDF: puppeteer
- Excel: exceljs

### Performance

Pre-computed + Redis cached (ANALYTICS_CACHE_TTL_SECS = 900)
Dashboard load target: < 5ms (served from cache)
Reports recomputed every 15 minutes via cron job.
