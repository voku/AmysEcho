import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SymbolButton } from './SymbolButton';

const symbol = {
  id: 'essen',
  name: 'Essen',
  emoji: '🍽️',
  category: 'essen',
};

describe('SymbolButton', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...navigator,
      vibrate: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers onPress on click and uses vibration', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();

    render(<SymbolButton symbol={symbol} onPress={onPress} />);

    await user.click(screen.getByRole('button', { name: 'Essen' }));

    expect(onPress).toHaveBeenCalledWith(symbol);
    expect(navigator.vibrate).toHaveBeenCalledWith(30);
  });

  it('supports keyboard activation', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();

    render(<SymbolButton symbol={symbol} onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Essen' });
    button.focus();
    await user.keyboard('{Enter}');

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
