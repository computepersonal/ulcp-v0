# Central observability stack (reference copy)

Grafana + Loki + Prometheus + Alloy, in its own Compose project `workstation-observability`.
It collects the stdout of every Docker container, so ULCP's JSON logs (see
[docs/observability/LOGGING.md](../docs/observability/LOGGING.md)) show up without any
ULCP-side configuration.

This is a **copy** of the configuration the original author runs on his workstation, kept here
so the next owner can recreate it. The running instance is the source of truth; if you change
the stack, change this copy too.

| File | Purpose |
|---|---|
| `compose.yml` | Runs Alloy (Docker collector), Loki, Prometheus, Grafana |
| `docker.alloy` | Discovers containers, labels them `project` / `service_name` / `container`, ships to Loki over OTLP with a persistent on-disk queue |
| `loki.yml` | Single-node Loki, filesystem storage, **14-day retention** (`retention_period: 336h`) |
| `prometheus.yml` | Scrapes the collector, Loki and itself; 14-day / 2 GB retention is set in `compose.yml` |
| `grafana/` | Provisioned data sources (`Local logs`, `Local metrics`) and the overview dashboard |

Not copied on purpose: the Windows-service collector (`config.alloy`, installer scripts —
workstation-specific, collects Windows events and a FrontDeskAI log folder) and anything under
`secrets/`.

## Start it

```bash
# 1. Grafana admin password (never commit it)
mkdir -p secrets && openssl rand -base64 24 > secrets/grafana-password.txt

# 2. Start
docker compose up -d

# 3. Open Grafana: http://localhost:3000   user: admin   password: contents of secrets/grafana-password.txt
```

Ports are bound to `127.0.0.1` only (Grafana 3000, Loki 3100, Prometheus 9090). Put an
authenticating proxy in front before exposing any of them.

## Check that ULCP logs arrive

```bash
docker compose -f ../docker-compose.yml up -d     # start ULCP (needs LOG_HOST_NAME on Linux/macOS)
curl -G http://localhost:3100/loki/api/v1/query_range --data-urlencode 'query={project="ulcp"}' --data-urlencode limit=3
```

or in Grafana → Explore → **Local logs**: `{project="ulcp"} | json`.

## Things to know

- The Docker collector mounts `/var/run/docker.sock` read-only. That does **not** make the Docker
  API read-only; treat the collector as trusted host infrastructure.
- Loki labels indexed from OTLP resources: `job, host, channel, container, project`
  (`loki.yml`). Adding a label means adding it in `docker.alloy` **and** `loki.yml`.
- This collector is for Docker. On Kubernetes, deploy a log collector as a DaemonSet and keep the
  same `project` / `service_name` labels (see LOGGING.md §5).
- Disk: Loki, Prometheus and Grafana data live in named Docker volumes; the collector's retry
  queue is capped at 256 MiB.
