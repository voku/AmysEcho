import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { AppStateProvider } from './hooks/useAppState';
import { ApiConfigProvider } from './hooks/useApiConfig';
import { MessageProvider } from './context/MessageContext';
import { SymbolStoreProvider } from './context/SymbolStore';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MessageProvider>
      <ApiConfigProvider>
        <AppStateProvider>
          <SymbolStoreProvider>
            <App />
          </SymbolStoreProvider>
        </AppStateProvider>
      </ApiConfigProvider>
    </MessageProvider>
  </React.StrictMode>,
);
