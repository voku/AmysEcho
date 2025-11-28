const mockQueueMessage = jest.fn();

jest.mock('../webview/utils/MessageBatcher', () => ({
  __esModule: true,
  messageBatcher: {
    queueMessage: mockQueueMessage,
  },
}));

const { EmergencyGestureSystem } = require('../webview/core/EmergencyGestureSystem');

describe('EmergencyGestureSystem', () => {
  let system: typeof EmergencyGestureSystem.prototype;

  beforeEach(() => {
    jest.clearAllMocks();
    system = new EmergencyGestureSystem();
  });

  it('flags key emergency gestures even at low confidence', () => {
    ['hilfe', 'help', 'danger'].forEach((gesture) => {
      expect(system.isEmergencyGesture(gesture, 0.3)).toBe(true);
    });
    expect(system.isEmergencyGesture('hello', 0.9)).toBe(false);
  });

  it('processes emergencies with critical priority and feedback', () => {
    const result = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
    expect(result.shouldProcess).toBe(true);
    expect(result.priority).toBe('critical');
    expect(result.feedback).toContain('Hilfe');
    expect(mockQueueMessage).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'emergency_gesture_detected' }),
      expect.any(Object),
    );
  });

  it('enforces cooldown between repeated emergencies', () => {
    system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
    const second = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
    expect(second.shouldProcess).toBe(false);
    expect(second.cooldownRemaining).toBeGreaterThan(0);
  });

  it('recommends emergency-only mode after multiple incidents', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    for (let i = 0; i < 3; i += 1) {
      nowSpy.mockReturnValue(1_000 + i * 100);
      system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
      jest.clearAllMocks();
    }
    nowSpy.mockReturnValue(2_000);
    expect(system.shouldEnterEmergencyMode()).toBe(true);
    const status = system.getStatus();
    expect(status.emergencyModeRecommended).toBe(true);
    nowSpy.mockRestore();
  });

  it('reset clears history and cooldown state', () => {
    system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
    system.reset();
    const result = system.processEmergencyGesture('hilfe', 0.4, [[[0, 0, 0]]]);
    expect(result.shouldProcess).toBe(true);
  });
});
