/**
 * Centralized export for all authentication route handlers
 */

export {
	handleEmailVerificationConfirm,
	handleEmailVerificationRequest,
} from "./emailVerification.js";
export { handleLogin } from "./login.js";
export {
	handlePasswordResetConfirm,
	handlePasswordResetRequest,
} from "./passwordReset.js";
export { handleRefreshToken } from "./refresh.js";
export { handleRegistration } from "./registration.js";

export { handleDeleteAccount } from "./deleteAccount.js";
