import { API_URL } from '../constants';
import { loadBackendApiToken } from '../storage';
import { logger } from '../utils/logger';

export interface CustomGestureRegistration {
  id: string;
  label: string;
  profileId?: string;
  emoji?: string | null;
}

export interface RegisterCustomGestureOptions {
  apiBaseUrl?: string;
  tokenOverride?: string | null;
  fetchImpl?: typeof fetch;
}

export interface RegisteredCustomGesture {
  id: string;
  label: string;
  profileId?: string;
  emoji?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type RegisterCustomGestureResult =
  | { status: 'registered'; gesture: RegisteredCustomGesture }
  | { status: 'skipped'; reason: 'missing-token' };

function assertGesturePayload(gesture: CustomGestureRegistration): void {
  if (!gesture || typeof gesture !== 'object') {
    throw new Error('Ungültige Geste für die Registrierung.');
  }
  if (typeof gesture.id !== 'string' || gesture.id.trim().length === 0) {
    throw new Error('Gesten-ID fehlt für die Registrierung.');
  }
  if (typeof gesture.label !== 'string' || gesture.label.trim().length === 0) {
    throw new Error('Gestenname fehlt für die Registrierung.');
  }
}

export async function registerCustomGesture(
  gesture: CustomGestureRegistration,
  options: RegisterCustomGestureOptions = {},
): Promise<RegisterCustomGestureResult> {
  assertGesturePayload(gesture);
  const token = options.tokenOverride ?? (await loadBackendApiToken());
  if (!token) {
    logger.warn('Skipping custom gesture registration: missing backend token', {
      gestureId: gesture.id,
    });
    return { status: 'skipped', reason: 'missing-token' };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Netzwerkfunktion für Gesten-Registrierung nicht verfügbar.');
  }

  const baseUrl = options.apiBaseUrl ?? API_URL;
  const endpoint = `${baseUrl}/api/v1/dgs/gestures`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: gesture.id,
      label: gesture.label,
      profileId: gesture.profileId,
      emoji: gesture.emoji ?? null,
    }),
  });

  const responseBody = await response
    .json()
    .catch(() => ({ error: `Status ${response.status}` }));

  if (!response.ok) {
    const reason = typeof responseBody?.error === 'string' ? responseBody.error : `Status ${response.status}`;
    throw new Error(`Registrierung der Geste fehlgeschlagen: ${reason}`);
  }

  if (!responseBody || typeof responseBody.id !== 'string' || typeof responseBody.label !== 'string') {
    throw new Error('Serverantwort zur Gesten-Registrierung ist unvollständig.');
  }

  const registeredGesture: RegisteredCustomGesture = {
    id: responseBody.id,
    label: responseBody.label,
    profileId: typeof responseBody.profileId === 'string' ? responseBody.profileId : undefined,
    emoji: typeof responseBody.emoji === 'string' ? responseBody.emoji : null,
    createdAt: typeof responseBody.createdAt === 'string' ? responseBody.createdAt : undefined,
    updatedAt: typeof responseBody.updatedAt === 'string' ? responseBody.updatedAt : undefined,
  };

  logger.info('Custom gesture registered on server', {
    gestureId: registeredGesture.id,
    label: registeredGesture.label,
  });

  return { status: 'registered', gesture: registeredGesture };
}
