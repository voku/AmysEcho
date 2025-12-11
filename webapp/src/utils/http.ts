export const SESSION_EXPIRED_MESSAGE = 'Sitzung abgelaufen. Bitte neu anmelden.';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
