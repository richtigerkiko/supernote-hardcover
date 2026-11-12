export const log = (...a: unknown[]) => console.log('[hardcover]', ...a);

export const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);
