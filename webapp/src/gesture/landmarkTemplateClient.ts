/**
 * Landmark Template Client
 *
 * Fetches landmark templates from the server and caches them locally.
 * Templates are used by LandmarkTemplateDetector for Euclidean-distance
 * based gesture recognition.
 */

import type { LandmarkTemplate } from './landmarkTemplateDetector';

export interface FetchTemplatesOptions {
  endpoint: string;
  profileId?: string;
  token?: string;
}

type TemplateUpdateListener = (templates: LandmarkTemplate[]) => void;
const listeners: Set<TemplateUpdateListener> = new Set();

/**
 * Subscribe to template update events.
 * Returns an unsubscribe function.
 */
export function onTemplatesUpdated(listener: TemplateUpdateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(templates: LandmarkTemplate[]): void {
  for (const listener of listeners) {
    try {
      listener(templates);
    } catch {
      // Ignore listener errors to prevent cascading failures
    }
  }
}

/**
 * Fetch landmark templates for a profile from the server.
 *
 * @returns Array of templates, or null on failure.
 */
export async function fetchLandmarkTemplates(
  options: FetchTemplatesOptions,
): Promise<LandmarkTemplate[] | null> {
  const { endpoint, profileId, token } = options;

  // Validate endpoint
  try {
    new URL(endpoint);
  } catch {
    console.warn('[Templates] Ungültige Endpoint-URL', { endpoint });
    return null;
  }

  const trimmedProfileId = profileId?.trim();
  if (!trimmedProfileId) {
    return [];
  }

  const url = `${endpoint}?profileId=${encodeURIComponent(trimmedProfileId)}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (trimmedProfileId) {
    headers['X-Profile-Id'] = trimmedProfileId;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn('[Templates] Server-Antwort nicht OK', {
        status: response.status,
        profileId: trimmedProfileId,
      });
      return null;
    }

    const data = (await response.json()) as { templates?: unknown[] };
    if (!Array.isArray(data?.templates)) {
      console.warn('[Templates] Ungültiges Antwortformat');
      return null;
    }

    const templates = data.templates as LandmarkTemplate[];
    notifyListeners(templates);
    return templates;
  } catch (error) {
    console.warn('[Templates] Netzwerkfehler beim Laden der Vorlagen', {
      error,
    });
    return null;
  }
}
