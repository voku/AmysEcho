import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from './logger.js';

export interface EmailService {
  sendVerificationEmail: (params: { email: string; username: string; token: string }) => Promise<void>;
  sendPasswordResetEmail: (params: { email: string; username: string; token: string }) => Promise<void>;
}

function buildVerificationEmail(params: { email: string; username: string; token: string }) {
  const { email, token } = params;
  // Sanitize username: remove control characters and newlines
  const safeUsername = params.username
    .replace(/[\r\n\t\x00-\x1F\x7F]/g, '')
    .trim();
  
  const verifyLink = `${config.appBaseUrl}/verify-email?email=${encodeURIComponent(
    email,
  )}&token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Bitte bestätige deine E-Mail-Adresse',
    text: [
      `Hallo ${safeUsername},`,
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
  const { email, token } = params;
  // Sanitize username: remove control characters and newlines
  const safeUsername = params.username
    .replace(/[\r\n\t\x00-\x1F\x7F]/g, '')
    .trim();
  
  const resetLink = `${config.appBaseUrl}/reset-password?email=${encodeURIComponent(
    email,
  )}&token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Passwort zurücksetzen',
    text: [
      `Hallo ${safeUsername},`,
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
      try {
        const email = buildVerificationEmail(params);
        await transporter.sendMail({
          from: config.smtpFrom,
          ...email,
        });
        logger.info('Verification email sent');
      } catch (error) {
        logger.error('Failed to send verification email', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        throw new Error('Email delivery failed');
      }
    },
    async sendPasswordResetEmail(params) {
      try {
        const email = buildResetEmail(params);
        await transporter.sendMail({
          from: config.smtpFrom,
          ...email,
        });
        logger.info('Password reset email sent');
      } catch (error) {
        logger.error('Failed to send password reset email', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        throw new Error('Email delivery failed');
      }
    },
  };
}
