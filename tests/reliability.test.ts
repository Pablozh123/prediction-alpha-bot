import { describe, expect, it } from "vitest";
import {
  createConcurrencyLimiter,
  retryWithBackoff,
  TimeoutError,
  withTimeout
} from "../src/utils/reliability.js";

describe("reliability helpers", () => {
  it("rejects timed out operations cleanly", async () => {
    await expect(
      withTimeout(
        new Promise((resolve) => {
          setTimeout(resolve, 20);
        }),
        1,
        "test timeout"
      )
    ).rejects.toThrow(TimeoutError);
  });

  it("retries with backoff before succeeding", async () => {
    const delays: number[] = [];
    let attempts = 0;

    const result = await retryWithBackoff(
      async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("temporary");
        }

        return "ok";
      },
      {
        attempts: 3,
        baseDelayMs: 5,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        }
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(delays).toEqual([5, 10]);
  });

  it("limits concurrent tasks", async () => {
    const limiter = createConcurrencyLimiter(2);
    let active = 0;
    let maxActive = 0;
    let releaseFirstBatch: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirstBatch = resolve;
    });

    const tasks = Array.from({ length: 5 }, (_, index) =>
      limiter.run(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);

        if (index < 2) {
          await gate;
        }

        active -= 1;
        return index;
      })
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(limiter.getActiveCount()).toBe(2);
    expect(limiter.getQueuedCount()).toBe(3);

    releaseFirstBatch();
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
  });
});
