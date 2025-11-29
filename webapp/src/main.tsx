import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { AppStateProvider } from './hooks/useAppState';
import { ApiConfigProvider } from './hooks/useApiConfig';
import { MessageProvider } from './context/MessageContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MessageProvider>
      <ApiConfigProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </ApiConfigProvider>
    </MessageProvider>
  </React.StrictMode>,
);
