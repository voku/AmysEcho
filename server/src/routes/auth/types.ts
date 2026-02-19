import type { Database } from "../../db.js";
import type { EmailService } from "../../services/emailService.js";
import type { ProfileRegistry } from "../../services/profileRegistry.js";
import type { withFileLock } from "../../utils/fileLock.js";

/**
 * Dependencies required by authentication route handlers
 */
export interface AuthRouteDeps {
	db: Database;
	dbFilePath: string;
	registry: ProfileRegistry;
	registryPath: string;
	saveRegistry: (
		registryPath: string,
		registry: ProfileRegistry,
	) => Promise<void>;
	withFileLock: typeof withFileLock;
	emailService: EmailService;
}
