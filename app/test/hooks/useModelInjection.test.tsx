import React, { useEffect, useRef } from 'react';
import { act, render } from '@testing-library/react-native';

import { useModelInjection } from '../../src/hooks/useModelInjection';

describe('useModelInjection', () => {
  const renderHarness = async () => {
    const statusMock = jest.fn();
    const injectJavaScript = jest.fn();
    let hookApi: (ReturnType<typeof useModelInjection> & {
      webviewRef: React.MutableRefObject<any>;
    }) | null = null;

    const Harness: React.FC<{ onReady: (api: typeof hookApi) => void }> = ({ onReady }) => {
      const webviewRef = useRef({ injectJavaScript });
      const hook = useModelInjection(webviewRef, statusMock);

      useEffect(() => {
        onReady({ ...hook, webviewRef });
      }, [hook, onReady, webviewRef]);

      return null;
    };

    render(<Harness onReady={(api) => { hookApi = api; }} />);

    await act(async () => {});

    if (!hookApi) {
      throw new Error('useModelInjection did not initialize');
    }

    return { ...hookApi, injectJavaScript, statusMock };
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('replays the most recent model when requeueLastModel is invoked after a reload', async () => {
    const {
      injectModel,
      markTransferComplete,
      mlpReadyRef,
      pendingModelRef,
      requeueLastModel,
      injectJavaScript,
      statusMock,
    } = await renderHarness();

    mlpReadyRef.current = true;

    act(() => {
      injectModel('QUJD', {
        profileId: 'profile-123',
        version: 'v2',
        source: 'test',
      });
    });

    expect(injectJavaScript).toHaveBeenCalledTimes(3);
    expect(statusMock).toHaveBeenCalledWith('updating');

    act(() => {
      markTransferComplete();
    });

    mlpReadyRef.current = false;
    injectJavaScript.mockClear();
    statusMock.mockClear();

    pendingModelRef.current = null;
    mlpReadyRef.current = true;

    const replayed = requeueLastModel();

    expect(replayed).toBe(true);
    expect(injectJavaScript).toHaveBeenCalledTimes(3);
    expect(statusMock).toHaveBeenCalledWith('updating');
  });

  it('returns false from requeueLastModel when no model has been injected', async () => {
    const { requeueLastModel, injectJavaScript, statusMock } = await renderHarness();

    const replayed = requeueLastModel();

    expect(replayed).toBe(false);
    expect(injectJavaScript).not.toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });
});
