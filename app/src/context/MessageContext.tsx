import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import ErrorMessage from '../components/ErrorMessage';

interface MessageContextValue {
  message: string | null;
  setMessage: (msg: string | null) => void;
}

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

export function MessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = (...args: any[]) => {
      setMessage(args.map(String).join(' '));
      originalWarn(...args);
    };
    console.error = (...args: any[]) => {
      setMessage(args.map(String).join(' '));
      originalError(...args);
    };
    return () => {
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  return (
    <MessageContext.Provider value={{ message, setMessage }}>
      {children}
      <ErrorMessage message={message} />
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return ctx;
}
