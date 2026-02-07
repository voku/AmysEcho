import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SentenceComposer, cellToSentenceSymbol, type SentenceSymbol } from './SentenceComposer';

describe('SentenceComposer', () => {
  const sampleSymbols: SentenceSymbol[] = [
    { id: 'metacom_ich', label: 'Ich', emoji: '👤', role: 'person' },
    { id: 'metacom_mehr', label: 'Mehr', emoji: '➕', role: 'modifier' },
  ];

  it('shows placeholder when queue is empty', () => {
    render(
      <SentenceComposer queue={[]} onRemoveLast={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText('Wähle Symbole, um einen Satz zu bilden')).toBeInTheDocument();
  });

  it('displays queued symbols', () => {
    render(
      <SentenceComposer queue={sampleSymbols} onRemoveLast={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText('👤 Ich')).toBeInTheDocument();
    expect(screen.getByText('➕ Mehr')).toBeInTheDocument();
  });

  it('shows slotting hints when enabled', () => {
    render(
      <SentenceComposer
        queue={sampleSymbols}
        onRemoveLast={vi.fn()}
        onClear={vi.fn()}
        slottingEnabled
      />
    );
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Modifier')).toBeInTheDocument();
  });

  it('disables buttons when queue is empty', () => {
    render(
      <SentenceComposer queue={[]} onRemoveLast={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Letztes Symbol löschen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Satz leeren' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Satz vorlesen' })).toBeDisabled();
  });

  it('enables buttons when queue has symbols', () => {
    render(
      <SentenceComposer queue={sampleSymbols} onRemoveLast={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Letztes Symbol löschen' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Satz leeren' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Satz vorlesen' })).not.toBeDisabled();
  });

  it('renders improve button and triggers callback', () => {
    const onImprove = vi.fn();
    render(
      <SentenceComposer
        queue={sampleSymbols}
        onRemoveLast={vi.fn()}
        onClear={vi.fn()}
        onImprove={onImprove}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Satz verbessern' }));
    expect(onImprove).toHaveBeenCalledTimes(1);
  });

  it('shows suggestion and error text when provided', () => {
    const { rerender } = render(
      <SentenceComposer
        queue={sampleSymbols}
        onRemoveLast={vi.fn()}
        onClear={vi.fn()}
        improvedSentence="Ich esse mehr."
      />,
    );

    expect(screen.getByText(/Vorschlag:/)).toBeInTheDocument();
    expect(screen.getByText('Ich esse mehr.')).toBeInTheDocument();

    rerender(
      <SentenceComposer
        queue={sampleSymbols}
        onRemoveLast={vi.fn()}
        onClear={vi.fn()}
        improvementError="Satzverbesserung ist gerade nicht verfügbar."
      />,
    );

    expect(
      screen.getByText('Satzverbesserung ist gerade nicht verfügbar.'),
    ).toBeInTheDocument();
  });

  it('calls onRemoveLast when backspace button is clicked', () => {
    const onRemoveLast = vi.fn();
    render(
      <SentenceComposer queue={sampleSymbols} onRemoveLast={onRemoveLast} onClear={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Letztes Symbol löschen' }));
    expect(onRemoveLast).toHaveBeenCalledTimes(1);
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(
      <SentenceComposer queue={sampleSymbols} onRemoveLast={vi.fn()} onClear={onClear} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Satz leeren' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('calls onSpeak with joined text when speak button is clicked', async () => {
    const onSpeak = vi.fn();
    render(
      <SentenceComposer queue={sampleSymbols} onRemoveLast={vi.fn()} onClear={vi.fn()} onSpeak={onSpeak} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Satz vorlesen' }));
    // speakSentence is async – wait for the callback
    await vi.waitFor(() => {
      expect(onSpeak).toHaveBeenCalledWith('Ich Mehr');
    });
  });

  it('has correct aria attributes for accessibility', () => {
    render(
      <SentenceComposer queue={[]} onRemoveLast={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByRole('region', { name: 'Satzkomponist' })).toBeInTheDocument();
  });
});

describe('cellToSentenceSymbol', () => {
  it('converts a MetacomSymbolCell to a SentenceSymbol', () => {
    const result = cellToSentenceSymbol({
      id: 'metacom_ja',
      label: 'Ja',
      emoji: '👍',
      position: 4,
      type: 'symbol',
      role: 'action',
    });
    expect(result).toEqual({ id: 'metacom_ja', label: 'Ja', emoji: '👍', role: 'action' });
  });

  it('uses symbolId when present', () => {
    const result = cellToSentenceSymbol({
      id: 'metacom_ja',
      label: 'Ja',
      emoji: '👍',
      position: 4,
      type: 'symbol',
      symbolId: 'custom_ja',
    });
    expect(result.id).toBe('custom_ja');
  });

  it('uses speech text over label', () => {
    const result = cellToSentenceSymbol({
      id: 'metacom_ja',
      label: 'Ja',
      emoji: '👍',
      position: 4,
      type: 'symbol',
      speech: 'Jawohl',
    });
    expect(result.label).toBe('Jawohl');
  });
});
