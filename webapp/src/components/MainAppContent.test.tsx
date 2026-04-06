import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MainAppContent } from './MainAppContent';

vi.mock('./SignLanguageRecorder', () => ({ SignLanguageRecorder: () => <div>Recorder Mock</div> }));
vi.mock('./BottomNav', () => ({ BottomNav: () => <nav>BottomNav Mock</nav> }));
vi.mock('./FloatingSupportButton', () => ({ FloatingSupportButton: () => <div>Support Mock</div> }));
vi.mock('./Admin', () => ({ Admin: () => <div>Admin Mock</div> }));
vi.mock('./CaregiverArea', () => ({ CaregiverArea: () => <div>CaregiverArea Mock</div> }));
vi.mock('./Help', () => ({ Help: () => <div>Help Mock</div> }));
vi.mock('./LearningHub', () => ({ LearningHub: () => <div>LearningHub Mock</div> }));
vi.mock('./MetacomBoard', () => ({ MetacomBoard: () => <div>MetacomBoard Mock</div> }));
vi.mock('./ParentalGate', () => ({ ParentalGate: () => <div>ParentalGate Mock</div> }));
vi.mock('./ProfileManager', () => ({ ProfileManager: () => <div>ProfileManager Mock</div> }));
vi.mock('./ProfileSelect', () => ({ ProfileSelect: () => <div>ProfileSelect Mock</div> }));
vi.mock('./Settings', () => ({ Settings: () => <div>Settings Mock</div> }));
vi.mock('./Teach', () => ({ Teach: () => <div>Teach Mock</div> }));
vi.mock('./TrainingUpload', () => ({ TrainingUploadWithRecording: () => <div>TrainingUpload Mock</div> }));

describe('MainAppContent', () => {
  it('rendert Root-Route plus globale Navigation', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MainAppContent />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recorder Mock')).toBeInTheDocument();
    expect(screen.getByText('Support Mock')).toBeInTheDocument();
    expect(screen.getByText('BottomNav Mock')).toBeInTheDocument();
  });
});
