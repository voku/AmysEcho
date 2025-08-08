import { APIRetryManager } from '../src/services/APIRetryManager';

jest.useFakeTimers();

describe('APIRetryManager', () => {
  it('retries failed operations with exponential backoff', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');
    const retry = new APIRetryManager();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = retry.executeWithRetry(operation, 'test');

    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(2);

    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBe('success');

    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 1000);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 2000);

    setTimeoutSpy.mockRestore();
  });

  it('throws after exceeding max retries', async () => {
    const operation = jest.fn().mockImplementation(() => Promise.reject(new Error('boom')));
    const retry = new APIRetryManager();

    const promise = retry.executeWithRetry(operation, 'test');
    const expectation = expect(promise).rejects.toThrow('boom');

    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      await jest.runOnlyPendingTimersAsync();
    }

    await expectation;
    expect(operation).toHaveBeenCalledTimes(4);
  });
});
