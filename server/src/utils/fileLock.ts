const fileLocks = new Map<string, Promise<void>>();

export async function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  fileLocks.set(file, prev.finally(() => next));

  let result: T;
  try {
    result = await fn();
  } catch (error) {
    release();
    if (fileLocks.get(file) === next) fileLocks.delete(file);
    throw error;
  }

  release();
  if (fileLocks.get(file) === next) fileLocks.delete(file);
  return result;
}
