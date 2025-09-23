import * as crash from '../src/services/crashReporting';
const { enqueueCrashReport, flushCrashReports, initCrashReporting } = crash;

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe.skip('crashReporting', () => {
  let prevErrorHandler: jest.Mock;
  let setGlobalHandler: jest.Mock;
  let prevUnhandled: jest.Mock;
  let currentHandler: any;

  beforeEach(() => {
    (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, status: 202 })) as any;
    prevErrorHandler = jest.fn();
    currentHandler = prevErrorHandler;
    setGlobalHandler = jest.fn((handler) => {
      currentHandler = handler;
    });
    prevUnhandled = jest.fn();
    (global as any).ErrorUtils = {
      getGlobalHandler: () => currentHandler,
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

  it('wraps global handlers only once', () => {
    initCrashReporting();
    const newErrorHandler = setGlobalHandler.mock.calls[0][0];
    const firstRejection = (global as any).onunhandledrejection;

    initCrashReporting();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
    expect((global as any).onunhandledrejection).toBe(firstRejection);

    const err = new Error('boom');
    newErrorHandler(err, true);
    expect(prevErrorHandler).toHaveBeenCalledWith(err, true);

    const event = { reason: new Error('oops') };
    firstRejection(event);
    expect(prevUnhandled).toHaveBeenCalledWith(event);
  });
});

