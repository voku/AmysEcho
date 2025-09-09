import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

interface Props {
  htmlContent: string;
  onMessage: (event: WebViewMessageEvent) => void;
  onError: (event: any) => void;
  onHttpError: (event: any) => void;
  onConsoleMessage: (event: any) => void;
  onPermissionRequest: (event: any) => void;
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
        onConsoleMessage={onConsoleMessage}
        onPermissionRequest={onPermissionRequest}
        cacheEnabled={true}
        cacheMode={'LOAD_CACHE_ELSE_NETWORK'}
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
