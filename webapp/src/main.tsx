import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { AppStateProvider } from './hooks/useAppState';
import { ApiConfigProvider } from './hooks/useApiConfig';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ApiConfigProvider>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ApiConfigProvider>
  </React.StrictMode>,
);
