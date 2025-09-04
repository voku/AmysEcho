import * as crash from '../src/services/crashReporting';
const { enqueueCrashReport, flushCrashReports, initCrashReporting } = crash;

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

describe('crashReporting', () => {
  let prevErrorHandler: jest.Mock;
  let setGlobalHandler: jest.Mock;
  let prevUnhandled: jest.Mock;

  beforeEach(() => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, status: 202 })) as any;
    prevErrorHandler = jest.fn();
    setGlobalHandler = jest.fn();
    prevUnhandled = jest.fn();
    (global as any).ErrorUtils = {
      getGlobalHandler: () => prevErrorHandler,
      setGlobalHandler,
    };
    (global as any).onunhandledrejection = prevUnhandled;
  });

  afterEach(() => {
    delete (global as any).ErrorUtils;
    delete (global as any).onunhandledrejection;
  });

  it('queues and flushes crash reports', async () => {
    await enqueueCrashReport(new Error('boom'), { screen: 'Recognition' });
    await enqueueCrashReport('string error');

    const uploaded = await flushCrashReports();
    expect(uploaded).toBe(2);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const call = (global as any).fetch.mock.calls[0];
    expect(call[0]).toContain('/api/crash-reports');
    const body = JSON.parse(call[1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].message).toBe('boom');
    expect(body[0].extra.screen).toBe('Recognition');
  });

  it('wraps global handlers', () => {
    initCrashReporting();

    expect(setGlobalHandler).toHaveBeenCalledWith(expect.any(Function));
    const newErrorHandler = setGlobalHandler.mock.calls[0][0];
    const err = new Error('boom');
    newErrorHandler(err, true);
    expect(prevErrorHandler).toHaveBeenCalledWith(err, true);

    const rejectionHandler = (global as any).onunhandledrejection;
    expect(typeof rejectionHandler).toBe('function');
    const event = { reason: new Error('oops') };
    rejectionHandler(event);
    expect(prevUnhandled).toHaveBeenCalledWith(event);
  });
});

