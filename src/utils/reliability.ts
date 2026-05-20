export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export type RetryWithBackoffOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  sleep?: (delayMs: number) => Promise<void>;
};

export type ConcurrencyLimiter = {
  run<T>(task: () => Promise<T>): Promise<T>;
  getActiveCount(): number;
  getQueuedCount(): number;
};

export async function withTimeout<T>(
  task: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  message = `Operation timed out after ${timeoutMs}ms`
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TimeoutError("Timeout must be a positive number of milliseconds.");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const operation = typeof task === "function" ? task() : task;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function retryWithBackoff<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryWithBackoffOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? (() => true);

  if (!Number.isInteger(attempts) || attempts <= 0) {
    throw new Error("retryWithBackoff attempts must be a positive integer.");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new Error("Concurrency limit must be a positive integer.");
  }

  let activeCount = 0;
  const queue: Array<() => void> = [];

  const acquire = async (): Promise<void> => {
    if (activeCount < maxConcurrent) {
      activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        activeCount += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    activeCount -= 1;
    const next = queue.shift();
    next?.();
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();

      try {
        return await task();
      } finally {
        release();
      }
    },
    getActiveCount(): number {
      return activeCount;
    },
    getQueuedCount(): number {
      return queue.length;
    }
  };
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
