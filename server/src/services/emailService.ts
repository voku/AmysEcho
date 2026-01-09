import nodemailer from "nodemailer";
import config from "../config/index.js";
import logger from "./logger.js";

// Regex to match control characters (Unicode range covers all control chars)
// Using String.fromCharCode to avoid ESLint no-control-regex
const CONTROL_CHARS_RE = new RegExp(
	`[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1F)}${String.fromCharCode(0x7F)}]`,
	"g",
);

export interface EmailService {
	sendVerificationEmail: (params: {
		email: string;
		username: string;
		token: string;
	}) => Promise<void>;
	sendPasswordResetEmail: (params: {
		email: string;
		username: string;
		token: string;
	}) => Promise<void>;
}

/**
 * Sanitize username by removing control characters and newlines
 */
function sanitizeUsername(username: string): string {
	return username.replace(CONTROL_CHARS_RE, "").trim();
}

/**
 * Build email with token-based verification link
 */
function buildTokenEmail(params: {
	email: string;
	username: string;
	token: string;
	subject: string;
	urlPath: string;
	tokenLabel: string;
	actionDescription: string;
}): { to: string; subject: string; text: string } {
	const { email, username, token, subject, urlPath, tokenLabel, actionDescription } = params;
	const safeUsername = sanitizeUsername(username);

	const link = `${config.appBaseUrl}${urlPath}?email=${encodeURIComponent(
		email,
	)}&token=${encodeURIComponent(token)}`;

	return {
		to: email,
		subject,
		text: [
			`Hallo ${safeUsername},`,
			"",
			actionDescription,
			`${tokenLabel}: ${token}`,
			`Oder klicke auf diesen Link: ${link}`,
			"",
			"Wenn du diese Anfrage nicht gestellt hast, kannst du diese Nachricht ignorieren.",
		].join("\n"),
	};
}

function buildVerificationEmail(params: {
	email: string;
	username: string;
	token: string;
}) {
	return buildTokenEmail({
		...params,
		subject: "Bitte bestätige deine E-Mail-Adresse",
		urlPath: "/verify-email",
		tokenLabel: "Dein Bestätigungscode",
		actionDescription: "bitte bestätige deine E-Mail-Adresse, um Amy's Echo zu nutzen.",
	});
}

function buildResetEmail(params: {
	email: string;
	username: string;
	token: string;
}) {
	return buildTokenEmail({
		...params,
		subject: "Passwort zurücksetzen",
		urlPath: "/reset-password",
		tokenLabel: "Dein Reset-Code",
		actionDescription: "du hast einen Passwort-Reset angefordert.",
	});
}

export function createEmailService(): EmailService {
	const transporter =
		config.mailTransport === "smtp"
			? nodemailer.createTransport({
					host: config.smtpHost,
					port: config.smtpPort,
					secure: config.smtpSecure,
					auth:
						config.smtpUser && config.smtpPass
							? { user: config.smtpUser, pass: config.smtpPass }
							: undefined,
				})
			: nodemailer.createTransport({
					sendmail: true,
					newline: "unix",
					path: config.sendmailPath,
				});

	return {
		async sendVerificationEmail(params) {
			try {
				const email = buildVerificationEmail(params);
				await transporter.sendMail({
					from: config.smtpFrom,
					...email,
				});
				logger.info("Verification email sent");
			} catch (error) {
				logger.error("Failed to send verification email", {
					error: error instanceof Error ? error.message : "Unknown error",
				});
				throw new Error("Email delivery failed");
			}
		},
		async sendPasswordResetEmail(params) {
			try {
				const email = buildResetEmail(params);
				await transporter.sendMail({
					from: config.smtpFrom,
					...email,
				});
				logger.info("Password reset email sent");
			} catch (error) {
				logger.error("Failed to send password reset email", {
					error: error instanceof Error ? error.message : "Unknown error",
				});
				throw new Error("Email delivery failed");
			}
		},
	};
}
