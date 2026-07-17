/**
 * Abortable delay helper for scene lifecycle work.
 * Resolves true when the delay completes, false when aborted.
 */

export function waitForDelay(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      resolve(completed);
    };

    const onAbort = () => finish(false);
    const timeoutId = window.setTimeout(() => finish(true), Math.max(0, ms));

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
