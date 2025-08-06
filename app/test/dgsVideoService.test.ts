import { playSymbolVideo } from '../src/services/videoService';
import * as FileSystem from 'expo-file-system';
import { GestureModelEntry } from '../src/model';

jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('playSymbolVideo', () => {
  const entry: GestureModelEntry = {
    id: 'hello',
    label: 'Hello',
    dgsVideoUri: '/path/video.mp4',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('skips when not using DGS or video missing', async () => {
    await playSymbolVideo(entry, false);
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    await playSymbolVideo({ id: 'hi', label: 'Hi' }, true);
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });

  it('checks video existence when DGS video is requested', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    await playSymbolVideo(entry, true);
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('/path/video.mp4');
  });
});
