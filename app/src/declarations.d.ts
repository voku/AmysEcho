declare module '@shopify/react-native-skia';
declare module 'crypto-js';
declare module 'react-native-webview';
declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm {
    SHA256 = 'SHA256',
  }
  export function digestFileAsync(
    algorithm: CryptoDigestAlgorithm,
    fileUri: string
  ): Promise<string>;
}
