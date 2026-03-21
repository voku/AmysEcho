import path from "path";

const RESOLVED_DATA_DIR = process.env.AMY_ECHO_DATA_DIR
	? path.resolve(process.env.AMY_ECHO_DATA_DIR)
	: path.join(process.cwd(), "data");

export const DB_FILE_PATH = path.join(RESOLVED_DATA_DIR, "db.json");
export const DB_SQLITE_PATH = path.join(RESOLVED_DATA_DIR, "db.sqlite");
