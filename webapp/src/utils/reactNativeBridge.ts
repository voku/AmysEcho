export const WEBVIEW_MESSAGE_EVENT = 'webapp:webview-message';

export function postWebviewMessage(message: unknown): void {
  const serialized = typeof message === 'string' ? message : JSON.stringify(message);
  window.dispatchEvent(new CustomEvent(WEBVIEW_MESSAGE_EVENT, { detail: serialized }));
}
