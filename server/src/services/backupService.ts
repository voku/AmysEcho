import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promises as fs } from "fs";
import { promisify } from "util";
import { DB_FILE_PATH } from "../constants/dbPaths.js";

const iv = randomBytes(16);

import config from "../config/index.js";

const password = config.backupSecret;

async function createBackup(): Promise<Buffer> {
	const dbContent = await fs.readFile(DB_FILE_PATH);
	const key = (await promisify(scrypt)(password, "salt", 32)) as Buffer;
	const cipher = createCipheriv("aes-256-ctr", key, iv);
	const encryptedData = Buffer.concat([
		cipher.update(dbContent),
		cipher.final(),
	]);
	return encryptedData;
}

async function restoreBackup(encryptedData: Buffer): Promise<void> {
	const key = (await promisify(scrypt)(password, "salt", 32)) as Buffer;
	const decipher = createDecipheriv("aes-256-ctr", key, iv);
	const decryptedData = Buffer.concat([
		decipher.update(encryptedData),
		decipher.final(),
	]);
	await fs.writeFile(DB_FILE_PATH, decryptedData);
}

export { createBackup, restoreBackup };
