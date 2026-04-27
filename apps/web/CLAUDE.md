# web (Staff POS) — Domain Context

> Platform-wide conventions are in the **root CLAUDE.md**.
> Shared frontend design system and state management are in **apps/CLAUDE.md**.
> This file contains staff POS web app-specific domain knowledge only.

---

## ROLE-BASED ACCESS

### Nav visibility by role

```
Waiter / Cashier / Head Chef / Kitchen Staff:
  Floor Map, Orders, Catalogue only

Branch Manager / Operations Partner:
  + Reports, Reservations, Customers, Staff

Owner (tenant_owner, primary_owner, managing_partner):
  + Inventory, Procurement, Settings, Activity Log

Owner only (route-level guard):
  /setup (post-onboarding checklist)
  /onboard (wizard) — non-owners skip directly to /floor-map
```

### Key rules
- Onboarding wizard (/onboard) only shown to owner roles — waiters/staff always go to /floor-map on login
- Setup banner in layout hidden from non-owners
- Floor map empty state: owners see "Add zone/table" buttons; waiters see "ask your manager" message
- canEditTables = tenant_owner | primary_owner | managing_partner | branch_manager

---

## STAFF POS WEB SCREENS

### Layout

Sidebar: 64px icons (expands 240px on hover)
Top bar: logo + business + branch + profile + notifications
Active state: brand-500 left border + brand-50 bg

### 1. Floor Map

Color-coded table cards: green (available) / amber (occupied) / red (billed) / brand (ordering) / pulsing (needs attention)
Section headers with waiter assignment color
Unassigned occupied table: red exclamation badge
Quick stats bar at top
Tap table → right panel: detail, bill, reassign, close table

### 2. Active Orders

Kanban columns per status: pending / preparing / ready / billed
Color-coded borders, time elapsed, waiter name on each card
One-click actions: Accept / Mark Ready / Serve / Print Bill

### 3. Catalogue Builder

View/Edit toggle (permission-gated — requires menu:edit)
Edit mode: drag handles, inline toggles, orange "● Live editing" warning banner

Per section: toggle, add item, rename, reorder, delete
Per item: toggle available, price override, sold out, change image, 2-step delete

### 4. Reports Dashboard

Metric cards + % change vs yesterday
Charts: revenue trend, top items, payment breakdown
Staff performance table
PDF + Excel export buttons (Pro+ only)

### 5. Staff Management

List with shift status badges
Card shows: name, role, section assignment, clock-in time
Actions: Edit, Permissions, More menu
Invite flow: email + role + permissions selector

### 6. Settings

Business profile, branches, payment setup,
QR management, printer config (IP address), notifications, subscription
