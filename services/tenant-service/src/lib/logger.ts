import { createLogger } from "@ulcp/shared";

// One JSON line per event in the central nine-field schema, written to stdout
// (see docs/observability/LOGGING.md). LOG_LEVEL overrides the default level.
export const logger = createLogger("tenant-service");
