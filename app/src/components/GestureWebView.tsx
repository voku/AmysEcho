import React, { forwardRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  MediaCapturePermissionGrantType,
} from 'react-native-webview/lib/WebViewTypes';
import { CAMERA_WEBVIEW_BASE_URL } from '../constants';
import type { WebViewPermissionRequestEvent } from '../webviewTypes';

interface Props {
  htmlContent: string;
  onMessage: (event: WebViewMessageEvent) => void;
  onError: (event: any) => void;
  onHttpError: (event: any) => void;
  onConsoleMessage?: (event: any) => void;
  onPermissionRequest?: (event: WebViewPermissionRequestEvent) => void;
}

export const GestureWebView = forwardRef<WebView, Props>(
  (
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
    interface PlatformProps {
      onConsoleMessage?: (event: any) => void;
      onPermissionRequest?: (event: WebViewPermissionRequestEvent) => void;
      mediaCapturePermissionGrantType?: MediaCapturePermissionGrantType;
    }
    const platformProps: PlatformProps = {};
    if (onConsoleMessage) {
      platformProps.onConsoleMessage = onConsoleMessage;
    }
    if (Platform.OS === 'ios') {
      platformProps.mediaCapturePermissionGrantType = 'grantIfSameHostElsePrompt';
    } else if (onPermissionRequest) {
      platformProps.onPermissionRequest = onPermissionRequest;
    }
    return (
      <View style={styles.container}>
        <WebView
          ref={ref}
          source={{ html: htmlContent, baseUrl: CAMERA_WEBVIEW_BASE_URL }}
          style={styles.webview}
          onMessage={onMessage}
          mediaPlaybackRequiresUserAction={false}
          domStorageEnabled={true}
          javaScriptEnabled={true}
          allowsInlineMediaPlayback={true}
          originWhitelist={['*']}
          androidLayerType={'hardware'}
          mixedContentMode={'always'}
          onError={onError}
          onHttpError={onHttpError}
          cacheEnabled={true}
          cacheMode={'LOAD_CACHE_ELSE_NETWORK'}
          {...platformProps}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

