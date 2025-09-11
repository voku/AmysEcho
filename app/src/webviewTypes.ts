import type { NativeSyntheticEvent } from 'react-native';

interface PermissionRequest {
  origin: string;
  resources: string[];
  grant: (resources: string[]) => void;
  deny: () => void;
}

export type WebViewPermissionRequestEvent = NativeSyntheticEvent<PermissionRequest>;
