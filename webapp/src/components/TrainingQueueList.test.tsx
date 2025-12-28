import { fireEvent, screen } from '@testing-library/dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingQueueList } from './TrainingQueueList';
import type { PersistedTrainingBundle } from '../training/trainingQueue';

const createBundle = (overrides: Partial<PersistedTrainingBundle> = {}): PersistedTrainingBundle => ({
  key: 'test-key-1',
  label: 'Hilfe',
  profileId: 'amy-demo',
  capturedAt: new Date().toISOString(),
  framesCount: 30,
  status: 'pending',
  attempts: 0,
  source: 'web://test',
  queuedAt: new Date().toISOString(),
  zipBytes: 0,
  storage: 'idb',
  ...overrides,
});

describe('TrainingQueueList', () => {
  it('shows empty message when no bundles', () => {
    render(<TrainingQueueList bundles={[]} />);
    expect(screen.getByText('Keine gespeicherten Bundles vorhanden.')).toBeInTheDocument();
  });

  it('renders bundle information', () => {
    const bundles = [createBundle()];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Hilfe · amy-demo/)).toBeInTheDocument();
    expect(screen.getByText(/Frames: 30/)).toBeInTheDocument();
    expect(screen.getByText(/Status: pending/)).toBeInTheDocument();
  });

  it('shows upload and delete buttons when handlers provided', () => {
    const onSyncBundle = vi.fn();
    const onRemoveBundle = vi.fn();
    const bundles = [createBundle()];

    render(
      <TrainingQueueList
        bundles={bundles}
        onSyncBundle={onSyncBundle}
        onRemoveBundle={onRemoveBundle}
      />
    );

    expect(screen.getByText('Jetzt hochladen')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
  });

  it('calls onSyncBundle when upload button clicked', () => {
    const onSyncBundle = vi.fn().mockResolvedValue(undefined);
    const bundles = [createBundle()];

    render(<TrainingQueueList bundles={bundles} onSyncBundle={onSyncBundle} />);

    fireEvent.click(screen.getByText('Jetzt hochladen'));
    expect(onSyncBundle).toHaveBeenCalledWith('test-key-1');
  });

  it('calls onRemoveBundle when delete button clicked', () => {
    const onRemoveBundle = vi.fn().mockResolvedValue(undefined);
    const bundles = [createBundle()];

    render(<TrainingQueueList bundles={bundles} onRemoveBundle={onRemoveBundle} />);

    fireEvent.click(screen.getByText('Löschen'));
    expect(onRemoveBundle).toHaveBeenCalledWith('test-key-1');
  });

  it('disables buttons when syncing', () => {
    const onSyncBundle = vi.fn();
    const onRemoveBundle = vi.fn();
    const bundles = [createBundle()];

    render(
      <TrainingQueueList
        bundles={bundles}
        onSyncBundle={onSyncBundle}
        onRemoveBundle={onRemoveBundle}
        syncing={true}
      />
    );

    expect(screen.getByText('Jetzt hochladen')).toBeDisabled();
    expect(screen.getByText('Löschen')).toBeDisabled();
  });

  it('disables upload button when bundle is uploading', () => {
    const onSyncBundle = vi.fn();
    const bundles = [createBundle({ status: 'uploading' })];

    render(<TrainingQueueList bundles={bundles} onSyncBundle={onSyncBundle} />);

    expect(screen.getByText('Jetzt hochladen')).toBeDisabled();
  });

  it('shows error message when bundle has lastError', () => {
    const bundles = [createBundle({ lastError: 'Verbindungsfehler' })];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Fehler: Verbindungsfehler/)).toBeInTheDocument();
  });

  it('shows attempt count when attempts > 0', () => {
    const bundles = [createBundle({ attempts: 3 })];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Versuche: 3/)).toBeInTheDocument();
  });

  it('formats bytes correctly', () => {
    const bundles = [createBundle({ zipBytes: 1536 })];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Größe: 1.5 KB/)).toBeInTheDocument();
  });

  it('shows clip size when available', () => {
    const bundles = [createBundle({ clipBytes: 2048 })];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Clip: 2.0 KB/)).toBeInTheDocument();
  });

  it('shows still image size when available', () => {
    const bundles = [createBundle({ stillBytes: 512 })];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Standbild: 512.0 Bytes/)).toBeInTheDocument();
  });

  it('renders multiple bundles', () => {
    const bundles = [
      createBundle({ key: 'key-1', label: 'Hilfe' }),
      createBundle({ key: 'key-2', label: 'Danke' }),
    ];
    render(<TrainingQueueList bundles={bundles} />);

    expect(screen.getByText(/Hilfe · amy-demo/)).toBeInTheDocument();
    expect(screen.getByText(/Danke · amy-demo/)).toBeInTheDocument();
  });
});
