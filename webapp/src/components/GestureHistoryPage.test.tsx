import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { GestureHistoryPage } from './GestureHistoryPage';
import { gestureHistoryService } from '../services/gestureHistoryService';

describe('GestureHistoryPage', () => {
  beforeEach(async () => {
    await gestureHistoryService.ready();
    gestureHistoryService.clearHistory();
  });

  it('zeigt gespeicherte Gebärden und leert den Verlauf', async () => {
    gestureHistoryService.addGesture({
      id: 'first',
      label: 'Hallo',
      emoji: '👋',
      confidence: 0.92,
      audioResponse: 'Hallo',
    });
    gestureHistoryService.addGesture({
      id: 'second',
      label: 'Danke',
      emoji: '🙏',
      confidence: 0.81,
      audioResponse: 'Danke',
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <GestureHistoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Zuletzt erkannte Gebärden' })).toBeInTheDocument();
    expect(screen.getByText(/Live mit der Kamera synchronisiert/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Kamera' })).toBeInTheDocument();
    expect(screen.getByText(/Erkannt/)).toBeInTheDocument();
    expect(screen.getAllByText('🙏 Danke', { selector: 'strong' })).toHaveLength(2);
    expect(screen.getAllByText('👋 Hallo', { selector: 'strong' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Verlauf löschen' }));

    await waitFor(() => {
      expect(screen.queryByText('🙏 Danke', { selector: 'strong' })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Noch kein Verlauf gespeichert/)).toBeInTheDocument();
  });
});
