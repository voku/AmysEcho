import { ChildSessionManager } from '../src/services/childSessionManager';

jest.useFakeTimers();

describe('ChildSessionManager', () => {
  it('triggers encouragement and break callbacks', () => {
    const encourage = jest.fn();
    const takeBreak = jest.fn();
    const manager = new ChildSessionManager(
      { onEncouragement: encourage, onBreak: takeBreak },
      1000,
      3000,
    );

    manager.startSession();

    jest.advanceTimersByTime(1000);
    expect(encourage).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);
    expect(takeBreak).toHaveBeenCalledTimes(1);
  });

  it('resets encouragement timer on activity', () => {
    const encourage = jest.fn();
    const takeBreak = jest.fn();
    const manager = new ChildSessionManager(
      { onEncouragement: encourage, onBreak: takeBreak },
      1000,
      5000,
    );

    manager.startSession();
    jest.advanceTimersByTime(800);
    manager.recordActivity();
    jest.advanceTimersByTime(800);
    expect(encourage).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(200);
    expect(encourage).toHaveBeenCalledTimes(1);
  });
});
