export function logInfo(message: string): void {
  console.log(message);
}

export function logWarn(message: string): void {
  console.warn(message);
}

export function logError(message: string): void {
  console.error(message);
}

export function formatStructuredLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields
  });
}

export function formatStructuredError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {}
): string {
  const normalized =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message
        }
      : {
          name: "Error",
          message: String(error)
        };

  return formatStructuredLog("error", event, {
    ...fields,
    error: normalized
  });
}
