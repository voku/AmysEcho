export type ApiClientConfig = {
  apiBaseUrl: string;
  apiToken?: string | null;
};

export const buildAuthHeaders = (token?: string | null): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};
