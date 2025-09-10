import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

interface Props {
  htmlContent: string;
  onMessage: (event: WebViewMessageEvent) => void;
  onError: (event: any) => void;
  onHttpError: (event: any) => void;
  onConsoleMessage?: (event: any) => void;
  onPermissionRequest?: (event: any) => void;
}

export const GestureWebView = forwardRef<WebView, Props>((
  {
    htmlContent,
    onMessage,
    onError,
    onHttpError,
    onConsoleMessage,
    onPermissionRequest,
  },
  ref
) => {
  const androidProps: any = {};
  if (onConsoleMessage) androidProps.onConsoleMessage = onConsoleMessage;
  if (onPermissionRequest) androidProps.onPermissionRequest = onPermissionRequest;

  return (
    <View style={styles.container}>
      <WebView
        ref={ref}
        source={{ html: htmlContent, baseUrl: 'https://camera.local' }}
        style={styles.webview}
        onMessage={onMessage}
        mediaPlaybackRequiresUserAction={false}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        mediaCapturePermissionGrantType={'grant'}
        androidLayerType={'hardware'}
        mixedContentMode={'always'}
        onError={onError}
        onHttpError={onHttpError}
        cacheEnabled={true}
        cacheMode={'LOAD_CACHE_ELSE_NETWORK'}
        {...androidProps}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
