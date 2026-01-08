import { type Database } from '../../db.js';
import { type EmailService } from '../../services/emailService.js';
import { type withFileLock } from '../../utils/fileLock.js';

/**
 * Dependencies required by authentication route handlers
 */
export interface AuthRouteDeps {
  db: Database;
  dbFilePath: string;
  withFileLock: typeof withFileLock;
  emailService: EmailService;
}
