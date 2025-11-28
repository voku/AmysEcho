const React = require('react');

function WebView(props) {
  // Provide a testID to allow getByTestId('mock-WebView') in tests
  return React.createElement('mock-WebView', { testID: 'mock-WebView', ...props });
}

module.exports = { WebView };

