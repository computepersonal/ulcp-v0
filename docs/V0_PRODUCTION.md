# V0 Production Plan

> Goal: a real, testable production environment — enough to onboard early customers for
> testing — built on hardware you already own. Not the final scale-out architecture; the
> minimum slice of ULCP that delivers: shop onboarding → catalog → order → KOT →
> PDF invoice, running on a real Kubernetes cluster you can debug and extend.

Last updated: 2026-08-26

---

## 1. V0 Scope

### Required services (5 — all already built)

| Service | Port | Role in this flow |
|---|---|---|
| identity-service | 3001 | Owner + staff auth, JWT, RBAC/permissions |
| tenant-service | 3002 | Shop creation, onboarding wizard, branches, staff invite (manual link, no email), floor map, KDS pairing codes |
| catalogue-service | 3003 | Product/menu catalog |
| order-service | 3004 | Orders, KOT generation + routing (auto/kds/printer modes), GST calc, **manual/cash payment recording only** |
| realtime-service | 3008 | Pushes KOT live to the KDS terminal via Socket.io |

### Frontend apps (2 — both built)

- **apps/web** — Staff POS: onboarding, floor map, orders, catalogue builder, staff mgmt, settings
- **apps/kds** — the KOT terminal display itself

### Explicitly excluded from V0

inventory, delivery, notification, media, loyalty, analytics, superadmin, procurement, ads,
jukebox, customer-web, customer-mobile. None are required for owner-onboards-shop →
catalog → staff-takes-order → KOT-to-kitchen → PDF-invoice.

### Decisions locked in for V0

- **Invoice:** PDF generation required now (customer sees a real invoice). WhatsApp/SMS
  delivery of that PDF is an explicit *future* goal, not V0 — see Known Gaps below for why
  that pulls in a storage dependency later.
- **Payments:** manual/cash recording only. No Razorpay integration in V0.
- **Staff invites:** owner copies the invite link/token from the dashboard and shares it
  manually (WhatsApp/SMS themselves). No notification-service dependency in V0.

### Known Gap — PDF invoice generation (not built yet)

order-service currently only has `GET /orders/:tenant_id/:id/bill` (JSON bill data). No PDF
export exists there — puppeteer-based PDF export currently only lives inside
analytics-service, gated to Pro+ reports, and pulling in all of analytics-service just for
one document is overkill. **Plan: add `GET /orders/:tenant_id/:id/invoice.pdf` directly to
order-service**, puppeteer-based (matches the project's existing PDF tool choice).

**Forward-compat note:** when WhatsApp/SMS invoice delivery is built later, Interakt (WhatsApp)
needs a *hosted URL* for document attachments, not raw PDF bytes — that's when media-service
(R2 storage) becomes a real dependency. Not needed for V0; just don't design the invoice
endpoint in a way that makes adding persistence later painful.

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

Do this for all 5 core services + 2 frontend apps = 7 images total.

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

## 7. Known Gaps Before Real Customer Onboarding

- [ ] Fix the broken per-service `Dockerfile` (prod) — see Step 0.
- [ ] Build production Dockerfiles for apps/web and apps/kds — none exist yet.
- [ ] Build the PDF invoice endpoint in order-service (Section 1 gap).
- [ ] Replace apps/web's hardcoded `localhost:PORT` fallbacks with real env-configured
  service URLs for the cluster (see `apps/web/AGENT_CONTEXT.md`).
- [ ] Decide when to move Postgres/Redis off single-node `local-path` storage onto
  something that survives a node failure (Longhorn, or managed DB).
- [ ] Add a 3rd node before this needs real HA guarantees.
