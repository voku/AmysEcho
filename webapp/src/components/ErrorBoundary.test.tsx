import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function ThrowingComponent(): never {
  throw new Error('Boom');
}

describe('ErrorBoundary', () => {
  it('zeigt die Standard-Fehleroberfläche bei Rendering-Fehlern', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
      expect(screen.getByText('Erneut versuchen')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('rendert die Fallback-UI wenn fallback gesetzt ist', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(
        <ErrorBoundary fallback={<div>Eigene Fehleransicht</div>}>
          <ThrowingComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Eigene Fehleransicht')).toBeInTheDocument();
      expect(screen.queryByText('Etwas ist schiefgelaufen')).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('ermöglicht einen Retry und rendert danach wieder Kinder', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldThrow = true;

    function SometimesThrowing() {
      if (shouldThrow) {
        throw new Error('Noch nicht bereit');
      }

      return <div>Wiederhergestellt</div>;
    }

    try {
      render(
        <ErrorBoundary>
          <SometimesThrowing />
        </ErrorBoundary>,
      );

      shouldThrow = false;
      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

      expect(screen.getByText('Wiederhergestellt')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});
