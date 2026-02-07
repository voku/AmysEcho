import { fetchWithRetry, HttpError, SESSION_EXPIRED_MESSAGE } from '../utils/http';
import { buildAuthHeaders } from './apiClient';

type SentenceImproveRequest = {
  endpoint: string;
  sentence: string;
  token?: string | null | undefined;
};

type SentenceImproveResponse = {
  improvedSentence: string;
};

async function postSentenceImprove({
  endpoint,
  sentence,
  token,
}: SentenceImproveRequest): Promise<SentenceImproveResponse> {
  const response = await fetchWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(token),
      },
      body: JSON.stringify({ sentence, locale: 'de' }),
    },
    { retries: 1, timeoutMs: 12000 },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const reason = payload?.error || response.statusText;
    throw new HttpError(response.status, reason);
  }

  return response.json() as Promise<SentenceImproveResponse>;
}

export async function improveMetacomSentence({
  endpoint,
  sentence,
  token,
  refreshAccessToken,
}: SentenceImproveRequest & { refreshAccessToken?: () => Promise<string | null> }): Promise<string> {
  try {
    const result = await postSentenceImprove({ endpoint, sentence, token });
    return result.improvedSentence;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401 && refreshAccessToken) {
      try {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const retryResult = await postSentenceImprove({
            endpoint,
            sentence,
            token: refreshed,
          });
          return retryResult.improvedSentence;
        }
      } catch (refreshError) {
        throw refreshError instanceof Error ? refreshError : new Error(SESSION_EXPIRED_MESSAGE);
      }
      throw new HttpError(401, SESSION_EXPIRED_MESSAGE);
    }
    throw error;
  }
}
