export const WEBVIEW_MESSAGE_EVENT = 'webapp:webview-message';

export type WebviewBridgeCleanup = () => void;

export function postWebviewMessage(message: unknown): void {
  const serialized = typeof message === 'string' ? message : JSON.stringify(message);

  // React Native host (falls vorhanden)
  window.ReactNativeWebView?.postMessage?.(serialized);

  // Web-Fallback (Standardpfad)
  window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: serialized }));
}

export function installReactNativeBridge(): WebviewBridgeCleanup {
  const existing = window.ReactNativeWebView;

  if (!existing) {
    window.ReactNativeWebView = {
      postMessage: (message: string) => {
        const parsedMessage = typeof message === 'string' ? message : JSON.stringify(message);
        window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: parsedMessage }));
        console.debug('[WebBridge] Nachricht weitergeleitet', parsedMessage);
      },
    } as NonNullable<typeof window.ReactNativeWebView>;
  }

  return () => {
    if (!existing) {
      delete window.ReactNativeWebView;
    }
  };
}
