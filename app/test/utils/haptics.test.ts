type HapticsModule = typeof import('../../src/utils/haptics');

function createHaptics(): { module: HapticsModule; vibrate: jest.Mock } {
  let loaded: HapticsModule | undefined;
  const localVibrate = jest.fn();

  jest.resetModules();
  jest.isolateModules(() => {
    jest.doMock('../../src/utils/logger', () => ({
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
      },
    }));
    jest.doMock('react-native', () => ({
      Vibration: {
        vibrate: localVibrate,
      },
    }));
    loaded = jest.requireActual('../../src/utils/haptics') as HapticsModule;
  });

  if (!loaded) {
    throw new Error('Haptics module could not be loaded');
  }

  return { module: loaded, vibrate: localVibrate };
}

describe('haptics shim', () => {
  let vibrate: jest.Mock;
  let impactAsync: HapticsModule['impactAsync'];
  let notificationAsync: HapticsModule['notificationAsync'];
  let selectionAsync: HapticsModule['selectionAsync'];
  let setHapticEnabled: HapticsModule['setHapticEnabled'];
  let ImpactFeedbackStyle: HapticsModule['ImpactFeedbackStyle'];
  let NotificationFeedbackType: HapticsModule['NotificationFeedbackType'];

  beforeEach(() => {
    jest.useFakeTimers();
    const { module, vibrate: vibrateMock } = createHaptics();
    vibrate = vibrateMock;
    ({
      impactAsync,
      notificationAsync,
      selectionAsync,
      setHapticEnabled,
      ImpactFeedbackStyle,
      NotificationFeedbackType,
    } = module);
    vibrate.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('vibrates with the light impact pattern and waits for completion', async () => {
    const promise = impactAsync(ImpactFeedbackStyle.Light);

    jest.advanceTimersByTime(20);
    await promise;

    expect(vibrate).toHaveBeenCalledWith(20);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('uses the error notification pattern for notification feedback', async () => {
    const promise = notificationAsync(NotificationFeedbackType.Error);

    jest.advanceTimersByTime(1000);
    await promise;

    expect(vibrate).toHaveBeenCalledWith([0, 60, 50, 60, 50, 60], false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('respects the haptic enabled toggle', async () => {
    setHapticEnabled(false);
    vibrate.mockClear();

    const promise = selectionAsync();

    jest.advanceTimersByTime(1000);
    await promise;

    expect(vibrate).not.toHaveBeenCalled();
  });
});
