const fileLocks = new Map<string, Promise<void>>();

export async function withFileLock<T>(
	file: string,
	fn: () => Promise<T>,
): Promise<T> {
	const prev = fileLocks.get(file) ?? Promise.resolve();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const chain = prev.catch(() => undefined).then(() => gate);
	fileLocks.set(file, chain);

	try {
		await prev.catch(() => undefined);
		return await fn();
	} finally {
		release();
		if (fileLocks.get(file) === chain) {
			fileLocks.delete(file);
		}
	}
}
