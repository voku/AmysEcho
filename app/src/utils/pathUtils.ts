import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

type MaybeString = string | null | undefined;

const toUriOrNull = (value: MaybeString): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > 0 ? value : null;
};

const ensureEndsWithSlash = (uri: string): string => (uri.endsWith('/') ? uri : `${uri}/`);

const getPathsObject = (): {
  bundle?: { uri?: MaybeString };
  document?: { uri?: MaybeString };
  cache?: { uri?: MaybeString };
} | null => {
  try {
    return (Paths as unknown) as {
      bundle?: { uri?: MaybeString };
      document?: { uri?: MaybeString };
      cache?: { uri?: MaybeString };
    };
  } catch (error) {
    return null;
  }
};

export const getBundleDirectoryUri = (): string | null => {
  const paths = getPathsObject();
  const fromPaths = toUriOrNull(paths?.bundle?.uri);
  const fromLegacy = toUriOrNull((FileSystem as Record<string, MaybeString>).bundleDirectory);
  return fromPaths ?? fromLegacy ?? null;
};

export const getDocumentDirectoryUri = (): string | null => {
  const paths = getPathsObject();
  const fromPaths = toUriOrNull(paths?.document?.uri);
  const fromLegacy = toUriOrNull((FileSystem as Record<string, MaybeString>).documentDirectory);
  // Some managed Expo runtimes omit documentDirectory entirely. Falling back to the cache directory keeps
  // audio prompts functional, even though cached files are less durable. Custom audio uploads guard against
  // this fallback and inform caregivers when persistence is not available.
  const fromCache = toUriOrNull(paths?.cache?.uri) ?? toUriOrNull((FileSystem as Record<string, MaybeString>).cacheDirectory);
  return fromPaths ?? fromLegacy ?? fromCache ?? null;
};

export const joinUriPath = (baseUri: string, relative: string): string =>
  `${ensureEndsWithSlash(baseUri)}${relative.replace(/^\//, '')}`;

export const ensureDirectoryUri = (uri: string | null): string | null =>
  uri ? ensureEndsWithSlash(uri) : null;
