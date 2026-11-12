export const log = (...a: unknown[]) => console.log('[hardcover]', ...a);

export const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);

// PDFs are never read: the reader picks the book and the edition by hand (owner decision 2026-11-12).
export const isPdf = (path: string) => /\.pdf$/i.test(path);
