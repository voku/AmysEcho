import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from './logger.js';

export interface EmailService {
  sendVerificationEmail: (params: { email: string; username: string; token: string }) => Promise<void>;
  sendPasswordResetEmail: (params: { email: string; username: string; token: string }) => Promise<void>;
}

function buildVerificationEmail(params: { email: string; username: string; token: string }) {
  const { email, username, token } = params;
  const verifyLink = `${config.appBaseUrl}/verify-email?email=${encodeURIComponent(
    email,
  )}&token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Bitte bestätige deine E-Mail-Adresse',
    text: [
      `Hallo ${username},`,
      '',
      'bitte bestätige deine E-Mail-Adresse, um Amy\'s Echo zu nutzen.',
      `Dein Bestätigungscode: ${token}`,
      `Oder klicke auf diesen Link: ${verifyLink}`,
      '',
      'Wenn du diese Anfrage nicht gestellt hast, kannst du diese Nachricht ignorieren.',
    ].join('\n'),
  };
}

function buildResetEmail(params: { email: string; username: string; token: string }) {
  const { email, username, token } = params;
  const resetLink = `${config.appBaseUrl}/reset-password?email=${encodeURIComponent(
    email,
  )}&token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Passwort zurücksetzen',
    text: [
      `Hallo ${username},`,
      '',
      'du hast einen Passwort-Reset angefordert.',
      `Dein Reset-Code: ${token}`,
      `Oder klicke auf diesen Link: ${resetLink}`,
      '',
      'Wenn du diese Anfrage nicht gestellt hast, kannst du diese Nachricht ignorieren.',
    ].join('\n'),
  };
}

export function createEmailService(): EmailService {
  const transporter =
    config.mailTransport === 'smtp'
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: config.smtpUser && config.smtpPass ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
        })
      : nodemailer.createTransport({
          sendmail: true,
          newline: 'unix',
          path: config.sendmailPath,
        });

  return {
    async sendVerificationEmail(params) {
      const email = buildVerificationEmail(params);
      await transporter.sendMail({
        from: config.smtpFrom,
        ...email,
      });
      logger.info('Verification email sent', { email: params.email });
    },
    async sendPasswordResetEmail(params) {
      const email = buildResetEmail(params);
      await transporter.sendMail({
        from: config.smtpFrom,
        ...email,
      });
      logger.info('Password reset email sent', { email: params.email });
    },
  };
}
