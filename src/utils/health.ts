import { createServer, type Server } from "node:http";
import { renderPrometheusMetrics } from "./metrics.js";

export const HEALTH_HOST = "127.0.0.1";
export const HEALTH_PORT = 9090;

const processStartedAtMs = Date.now();

export type HealthPayload = {
  status: "ok";
  paperOnly: true;
  uptimeSeconds: number;
};

export type HealthServerOptions = {
  host?: string;
  port?: number;
  logger?: {
    info(message: string): void;
    error(message: string): void;
  };
};

export function getHealthPayload(
  nowMs = Date.now(),
  startedAtMs = processStartedAtMs
): HealthPayload {
  return {
    status: "ok",
    paperOnly: true,
    uptimeSeconds: Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
  };
}

export function renderHealthJson(payload: HealthPayload = getHealthPayload()): string {
  return JSON.stringify(payload);
}

export function startHealthServer(options: HealthServerOptions = {}): Server {
  const host = options.host ?? HEALTH_HOST;
  const port = options.port ?? HEALTH_PORT;
  const server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "/";

    if (path === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(renderHealthJson());
      return;
    }

    if (path === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      response.end(renderPrometheusMetrics());
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found\n");
  });

  server.on("error", (error) => {
    options.logger?.error(`health server error: ${error.message}`);
  });

  server.listen(port, host, () => {
    options.logger?.info(`health server listening on ${host}:${port}`);
  });

  return server;
}

export function closeHealthServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (!error || ("code" in error && error.code === "ERR_SERVER_NOT_RUNNING")) {
        resolve();
        return;
      }

      reject(error);
    });
  });
}
