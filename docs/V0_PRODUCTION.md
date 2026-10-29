# V0 Production Plan

> Goal: a real, testable production environment — enough to onboard early customers —
> built on hardware you already own. The slice of ULCP that delivers: shop onboarding →
> catalogue → **customer places an order from their phone (QR) or staff takes it** → KOT to
> the kitchen → **pay (cash / Razorpay)** → **PDF invoice** → **owner dashboards**, plus
> aggregator orders via **UrbanPiper**, running on a real Kubernetes cluster you can debug.

Last updated: 2026-10-29 (scope widened — see "Scope change" below)

Repo: https://github.com/computepersonal/ulcp-v0 (`main` = what gets deployed).
Day-to-day feature work by other developers happens in the original `ulcp` repo; anything V0
needs is brought across by cherry-pick/PR.

---

## 0. Status snapshot

**Done and running in Docker (`docker compose up -d --build`, open http://localhost:8000):**

- 5 services (identity, tenant, catalogue, order, realtime) + Postgres 16 + Redis 7
- 3 web apps: staff POS (`/`), **onboarding (`/onboarding/`, split out of the POS)**, KDS (`/kds/`)
- Caddy gateway, single origin; service-name upstreams (same names work in Kubernetes)
- One Dockerfile for all services (`docker/service.Dockerfile`), one for all apps
  (`docker/app.Dockerfile`; Caddy serves static files, no Node at runtime)
- Compose project named `ulcp`; containers labelled `observability.product=ulcp`
- **Central logging:** every service logs the nine-field JSON schema to stdout with CorrelationId / ServiceRequestId propagated over HTTP and Redis events; collected by the shared Loki/Grafana stack ([docs/observability/LOGGING.md](../docs/observability/LOGGING.md), config copy in [observability/](../observability/README.md))
- Frontends built with empty `VITE_*` URLs → relative `/api/v1/...`, so the same image runs
  behind any domain

**Not done yet:** browser smoke test, everything marked *To build* in Section 1, logging
slice, CI/registry, Kubernetes manifests, backups, domain/TLS, VPS standby.

---

## 1. V0 Scope

### Scope change (2026-10-29)

V0 was originally *cash only, staff-operated, no customer app*. After discussion, these are
**now V0 basics**:

1. Customer app — customers place orders themselves
2. PDF invoice
3. Razorpay payments
4. UrbanPiper integration
5. Dashboards and graphs

Consequence: V0 is larger than the first plan (more components, two of them not built), so
the first production date moves out accordingly.

### Services

| Service | Port | In V0 | Role |
|---|---|---|---|
| identity-service | 3001 | ✅ built | Staff + **customer OTP login**, JWT, RBAC |
| tenant-service | 3002 | ✅ built | Shops, onboarding wizard, branches, staff invites, floor map, KDS pairing, **QR/slug → shop resolve for the customer app** |
| catalogue-service | 3003 | ✅ built | Menu/catalogue |
| order-service | 3004 | ✅ built, extend | Orders, KOT, GST, cash payments. **To add:** PDF invoice, Razorpay (+ refunds), UrbanPiper inbound orders |
| realtime-service | 3008 | ✅ built | Live KOT to KDS, **order tracking for customers** |
| notification-service | 3007 | ⬜ bring across | **Required** to deliver the customer OTP by SMS (MSG91). Later: order-status messages / WhatsApp invoice |
| analytics-service | 3009 | ⬜ **stub — to build** | Dashboards and graphs (revenue, orders, top items, hourly, payment mix) |

Postgres 16 and Redis 7 are infrastructure, not services. In Kubernetes they become
StatefulSets with persistent volumes.

### Frontend apps

| App | Path | In V0 | Notes |
|---|---|---|---|
| Staff POS (`apps/web`) | `/` | ✅ built | Floor map, orders, catalogue builder, staff, settings. **To add:** Dashboard/Reports screens fed by analytics-service |
| Onboarding (`apps/onboarding`) | `/onboarding/` | ✅ built | Register, wizard, staff-invite acceptance. Separate app/server so sign-up traffic never touches the POS |
| KDS (`apps/kds`) | `/kds/` | ✅ built | Kitchen display |
| Customer app (`apps/customer-web`) | path TBD | ⬜ bring across + trim | PWA: scan QR → menu → cart → checkout → order tracking → order history |

### Work items and owners

| # | Item | Owner | Status | Notes |
|---|---|---|---|---|
| A | PDF invoice `GET /orders/:tenant_id/:id/invoice.pdf` | developer 1 | To build | In order-service, puppeteer. The slim Alpine image has no Chromium — add it to the order-service image only. Keep the generator separable from the route, because WhatsApp/SMS delivery later needs a hosted URL (media-service/R2) |
| B | UrbanPiper integration | developer 2 | To build | Public webhook route through the gateway (signature-verified), per-shop credential storage, mapping aggregator orders → ULCP orders → KOT. Decide: module in order-service vs separate integration service |
| C | Razorpay | unassigned | **Port, don't rewrite** | `feat/payments-gateway` in the original repo already has Razorpay + mock gateway, prepaid-order holds until captured, refunds, and a GST/plan fix. Cherry-pick, then review and test in Docker. Needs a webhook route + key storage |
| D | Dashboards and graphs | developer 3 | To build | analytics-service has no source today. Decide first: new service (as designed) or read-models inside order-service. Charts in the POS (`recharts` is already a dependency of apps/web) |
| E | Customer app in V0 | us | To trim + integrate | See below |
| F | Customer OTP SMS delivery | us | **Blocker** | In production the OTP is generated and stored but **never sent** (`identity-service` `auth.routes.ts`: "In production: send via MSG91. For now log it"). Wire MSG91 via notification-service. The Docker stack runs `NODE_ENV=production`, so the OTP there is random and not logged — customer login can't be tested until F is done (or a documented non-production test-phone bypass is added) |

### Customer app (E) — what is in and out

In: QR/slug landing → catalogue → item detail → cart → checkout (cash / Razorpay) → order
tracking (live via realtime) → order history.

Out for V0 (must be hidden or disabled, not left as dead links): rewards/loyalty, explore
feed, ads, jukebox, social room, places/campus/food-court. These call services that are not
in V0.

Open: **item images.** Customers will expect photos; media-service (image upload, R2) is not
in V0. Decide: launch without images, or add media-service + R2.

### Decisions locked in for V0

- **Payments:** cash + Razorpay (after item C). Prepaid orders are held until the payment is
  captured; refunds supported.
- **Invoice:** PDF generated on demand by order-service. WhatsApp/SMS delivery of the PDF is
  still a future goal.
- **Staff invites:** manual link copied by the owner (no email). Invite URLs are
  `/onboarding/invite/:token`.
- **One origin:** UIs and APIs sit behind one gateway origin so the POS and onboarding apps
  share the login (localStorage `staff_auth`).
- **Excluded from V0:** inventory, delivery, loyalty, procurement, ads, jukebox, superadmin,
  customer-mobile, places/campus. Their menu entries in the POS must be hidden (they 404).

---

## 2. Target Infrastructure

- **2x desktop machines, 20GB RAM each, same LAN** (already confirmed same network — no
  VPN/mesh needed for this first cluster).
- **k3s** (not full kubeadm k8s) — single binary, built-in Traefik ingress, ServiceLB, and
  local-path storage provisioner. Right-sized for 2 nodes / 40GB RAM total; full k8s control
  plane overhead isn't worth it here.
- **Not HA at the control-plane level.** etcd quorum needs an odd number of server nodes
  (3+) for real HA — with 2 machines you get Machine A as k3s **server** (control-plane +
  workloads) and Machine B as k3s **agent** (worker). This is a known, accepted limitation for
  the V0/testing phase, not an oversight. Add a 3rd (even a small/cheap) node later to get
  proper HA before real customer traffic depends on it.

### OS decision: dual-boot Ubuntu Server 22.04 LTS on both machines

Both machines currently run Windows with **OEM licenses that cannot be manually
reinstalled** — reason enough to avoid a full wipe. Dual-boot was chosen over both
alternatives:

- ❌ **Full wipe** — unnecessary risk for no benefit over dual-boot, given the OEM license
  constraint.
- ❌ **k3s inside WSL2** — WSL2's default networking is NAT'd inside each Windows host, so a
  k3s node on Machine B's WSL2 isn't reachable from Machine A over LAN without extra config
  (Windows 11 23H2+ "mirrored" networking mode, or manual `netsh portproxy` rules). This
  project already hit a related WSL2 networking/file-event class of bug once (Docker Desktop
  + `tsx watch` hot reload, see `docker-all-in-one-dev-setup` notes) — treat that as a signal,
  not a hypothetical.
- ✅ **Dual-boot** — Windows partition stays untouched and bootable (zero license risk, fully
  reversible), real bare-metal Linux performance for k3s, plain LAN networking with none of
  WSL2's cross-host wrinkles. Only cost: shrinking the Windows partition to make room.

---

## 3. Pre-Install Checklist

### Open decision: second drive vs. single-disk partition

Both machines have only a **256GB disk** — tight for a node running Postgres/Redis/log
buffers long-term (realistic minimum for the Ubuntu side alone: 80-100GB+, growing with
customer data). Two paths, not yet resolved per-machine:

- **Preferred: add a second dedicated drive** (spare M.2 slot or SATA bay) purely for
  Ubuntu — zero risk to the Windows partition, no shrink math, full room to grow. Check via
  the machine's spec sheet (search `<manufacturer> <model> specifications`) or by opening
  the case and looking for an empty M.2 slot / unused SATA data+power cable.
- **Fallback: partition the existing 256GB disk** — only viable if `This PC → C: →
  Properties` shows enough genuine free space after accounting for Windows' own headroom
  (updates, hibernation file, WinSxS). Needs Disk Cleanup / `powercfg /hibernate off` first
  to reclaim space before sizing the split.

Resolve this **per machine** before Step 2 below — the two desktops may not have identical
expansion options.

On each Windows machine, before creating the Ubuntu partition:

1. **Free up disk space** — shrink the Windows partition (Disk Management → Shrink Volume)
   to leave at least 60-100GB unallocated for Ubuntu Server + container images/volumes.
2. **Confirm virtualization is enabled in firmware** (needed regardless — some container
   runtimes benefit from it, and it's free to check): Task Manager → Performance → CPU →
   "Virtualization: Enabled." If disabled, enable it in BIOS/UEFI (no data risk).
3. **If you ever reconsider a full wipe later:** confirm `Settings → System → Activation`
   shows a digital license linked to a Microsoft account (add one now if not), and back up
   the OEM key via `wmic path softwarelicensingservice get OA3xOriginalProductKey` (run as
   admin). Not required for the dual-boot path — documented here so it's not re-researched
   later.

---

## 4. Step-by-Step Deployment Guide

This is written to be followed **without Claude** — plain commands, one machine at a time.
"Machine A" = k3s server, "Machine B" = k3s agent. Run everything as a non-root user with
sudo.

### Step 0 — Build production container images (on your current dev machine)

The existing per-service `Dockerfile` (not `.dev`) files are broken — `pnpm install
--frozen-lockfile` in their `deps` stage only sees 2-3 package.json files instead of the
full pnpm workspace, so installs silently miss workspace deps like `ioredis`. Fix before
using them:

- Use a proper multi-stage build: `COPY . .` the **whole repo** (respecting a correct root
  `.dockerignore` that excludes `node_modules`/`dist`/`.git` but keeps every workspace
  `package.json` reachable) *before* `pnpm install --frozen-lockfile`, so pnpm resolves
  against the real workspace. Alternative worth evaluating: `pnpm deploy` (produces a pruned,
  self-contained bundle per package) — cleaner than blanket-copying the monorepo into a final
  image.
- Every image needs `RUN apk add --no-cache openssl` (Alpine lacks it; Prisma's engine
  needs it, otherwise you get a cryptic "could not locate Query Engine" error at runtime).
- Final stage should be a slim runtime copying only built `dist/` + production
  `node_modules` — not the dev image with source bind-mounted.
- **apps/web and apps/kds have no Dockerfile yet at all.** Build one each: Vite build stage
  (`vite build` → static `dist/`) → static-serve stage (nginx or Caddy serving `dist/`).

Do this for every V0 service and app (today 5 services + 3 apps = 8 images; the final V0 adds notification, analytics and the customer app). The Dockerfiles already exist: `docker/service.Dockerfile` and `docker/app.Dockerfile`.

### Step 1 — Push images to a registry both machines can reach

Use **GitHub Container Registry (ghcr.io)** — free for private images tied to your GitHub
account, reachable from any location without VPN (this matters later for the multi-cluster
goal, see Section 6).

```bash
docker login ghcr.io -u <your-github-username>
docker tag ulcp/identity-service:latest ghcr.io/<you>/ulcp-identity-service:v0
docker push ghcr.io/<you>/ulcp-identity-service:v0
# repeat for tenant, catalogue, order, realtime, web, kds
```

### Step 2 — Install Ubuntu Server 22.04 LTS on both machines (dual-boot)

Standard Ubuntu Server installer into the shrunk partition on each machine. Keep the
existing Windows boot entry (GRUB will offer both on boot).

### Step 3 — Install k3s server on Machine A

```bash
curl -sfL https://get.k3s.io | sh -
sudo cat /var/lib/rancher/k3s/server/node-token   # save this token — Machine B needs it
```

### Step 4 — Join Machine B as an agent

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://<Machine-A-LAN-IP>:6443 \
  K3S_TOKEN=<token from Step 3> sh -
```

Verify from Machine A:

```bash
sudo k3s kubectl get nodes
# should show both machines, STATUS=Ready
```

### Step 5 — Get `kubectl` working from your everyday workstation

```bash
# on Machine A
sudo cat /etc/rancher/k3s/k3s.yaml
```

Copy that file to your workstation's `~/.kube/config`, replacing `127.0.0.1` with Machine
A's LAN IP. Install `kubectl` locally, then install **k9s** (terminal UI — see Section 5)
for day-to-day debugging.

### Step 6 — Namespace, secrets, config

```bash
kubectl create namespace ulcp-v0
kubectl -n ulcp-v0 create secret generic ulcp-secrets \
  --from-literal=JWT_SECRET=<value> \
  --from-literal=INTERNAL_API_SECRET=<value> \
  --from-literal=POSTGRES_PASSWORD=<value>
```

Non-sensitive per-service config (PORT, internal service URLs using k8s DNS —
`http://identity-service.ulcp-v0.svc.cluster.local:3001`) goes in a ConfigMap.

### Step 7 — Deploy Postgres + Redis

Pin both to Machine A via `nodeSelector` so their `local-path` PersistentVolumeClaims stay
put (k3s's default storage provisioner ties a volume to whichever node created it — moving
the pod without moving the disk breaks it). This is a known V0 limitation: if Machine A's
disk dies, that data is gone. Acceptable for a pre-customer testing cluster; revisit with
Longhorn (replicated storage across both nodes) before real customer data depends on it.

### Step 8 — Deploy the 5 core services

Standard Deployment + Service per service, image from `ghcr.io/<you>/ulcp-<service>:v0`,
env from the Secret + ConfigMap created in Step 6.

### Step 9 — Deploy the 2 frontend apps

Same pattern — Deployment + Service, pointing at the in-cluster service DNS names for their
backend API calls (replaces the `localhost:PORT` fallbacks apps/web currently hardcodes —
see `apps/web/AGENT_CONTEXT.md` gotchas, this needs real env vars for a non-local target).

### Step 10 — Ingress

k3s ships Traefik by default. Define `Ingress` resources routing hostnames/paths to the 7
services above — same mapping the local `Caddyfile` already encodes, translated to k8s
Ingress rules.

### Step 11 — (Optional) External access for real device testing

Run `cloudflared` as a Deployment inside the cluster, pointed at the Traefik ingress
service, using the same Cloudflare Tunnel approach already validated for local dev (see
`caddy-cloudflare-tunnel` notes) — no port forwarding, works from any device on the internet
for testing.

### Step 12 — Smoke test

Full path: register owner → create shop → run onboarding wizard → add catalog items → add
staff with limited role → staff logs in → places an order → KOT appears on the KDS terminal
→ mark items ready → generate PDF invoice → record cash payment.

---

## 5. Debugging & Observability

- **kubectl** — `logs -f`, `exec -it`, `describe pod`, `get events` for one-off debugging.
- **k9s** — terminal UI for browsing pods/logs/exec across the cluster interactively; the
  single best day-to-day tool at this cluster size. Install on your workstation using the
  kubeconfig from Step 5.
- **Centralized logging, stored OUTSIDE the two servers:**
  - Deploy **Grafana Loki** + **Grafana** in-cluster, but point Loki's chunk storage at
    **Cloudflare R2** (S3-compatible, already have credentials for media-service, zero
    egress fees) instead of local node disk. This satisfies "logs must survive independent
    of the servers" without needing a third always-on machine yet — if both desktops go
    down, the log history in R2 is untouched.
  - **Promtail** (or Grafana Alloy) as a DaemonSet on every node — tails container
    stdout/stderr. All 5 services already log structured JSON via Pino, which is ideal for
    Loki's query language (LogQL) — no log-format work needed.
  - This same Loki endpoint is the one every future cluster/location ships logs to (Section
    6) — the design doesn't change when a second physical location is added, only another
    Promtail agent pointed at the same URL.
  - **Graduation path:** once there's a real reason (multiple clusters, or wanting log
    survival independent of R2/Cloudflare too), move Loki itself onto a small dedicated
    always-on box — the more literal reading of "outside the actual servers." Not needed to
    start.

---

## 6. Multi-Cluster / Multi-Location Roadmap

Goal: spin up a new k3s cluster at a different physical location and have it (a) run from
the same manifests/images and (b) ship logs to the same central place, without re-inventing
the setup each time.

1. **Keep all k8s manifests as Kustomize overlays in the repo** — `k8s/base/` (shared
   Deployments/Services/ConfigMaps) + `k8s/overlays/<location-name>/` (per-location
   differences: replica counts, node selectors, ingress hostnames). A new location becomes
   `kubectl apply -k k8s/overlays/new-location` instead of hand-written YAML each time.
2. **Images already live in GHCR (Step 1)** — any new location just needs `docker login
   ghcr.io` + the manifests; no local registry to stand up per location, no VPN required to
   pull images.
3. **Point the new cluster's Promtail/Alloy DaemonSet at the same central Loki URL**,
   exposed via the same Cloudflare Tunnel pattern from Section 5/Step 11 — Tunnel is
   specifically good at this (no firewall/port-forwarding work per location).
4. **Once managing more than ~2-3 clusters becomes real**, adopt a multi-cluster manager
   (Rancher, or Fleet/ArgoCD for GitOps-style "apply this manifest set to N clusters")
   instead of manually `kubectl apply`-ing to each one by hand. Not needed for the second
   cluster — flagged here so it's not re-researched from scratch later.

---

## 7. Backlog Before Real Customer Onboarding

### Done
- [x] Production Dockerfiles for all 5 services (`docker/service.Dockerfile`)
- [x] Production images for web, onboarding, kds (`docker/app.Dockerfile`)
- [x] Hardcoded `localhost:PORT` fallbacks neutralised (empty `VITE_*` → relative URLs)
- [x] Onboarding split into its own app
- [x] V0 repo split (`ulcp-v0`), compose project `ulcp`, gateway

### Feature work (Section 1)
- [ ] A — PDF invoice (developer 1)
- [ ] B — UrbanPiper (developer 2)
- [ ] C — Razorpay (port from `feat/payments-gateway`)
- [ ] D — Analytics service + dashboards (developer 3)
- [ ] E — Customer app trimmed, built into an image, routed through the gateway
- [ ] F — Customer OTP over SMS (MSG91) — blocks customer login
- [ ] Item images decision (media-service or none)
- [ ] Hide POS pages for services not in V0 (Inventory, Procurement, loyalty parts)

### Platform
- [ ] Browser smoke test of the whole flow in Docker (staff path and customer path)
- [x] Logging: shared nine-field logger, CorrelationId/ServiceRequestId, verified in central Loki — see [docs/observability/LOGGING.md](../docs/observability/LOGGING.md) (still open: ship browser errors, Kubernetes collector)
- [ ] CI: build and push the images to a registry on every merge to `main`
- [ ] Secrets out of `docker-compose.yml` into `.env` / Kubernetes Secrets
- [ ] Slim the service images (410–630 MB today)
- [ ] Kubernetes manifests: base + home overlay, Postgres/Redis StatefulSets, Traefik ingress
- [ ] Postgres backups to Cloudflare R2 and a tested restore
- [ ] Domain, TLS, Cloudflare tunnel; VPS standby cluster
- [ ] Decide when to move Postgres/Redis off single-node `local-path` storage
- [ ] Third node before this needs real HA guarantees

### Process
- [ ] Protect `main` on `ulcp-v0`; developers push a branch per feature and merge by PR
- [ ] Each change is its own commit(s), pushed when done
