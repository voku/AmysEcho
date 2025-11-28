import React from 'react';
import renderer, { act } from 'react-test-renderer';
import ScreenFlash from '../../src/components/ScreenFlash';

describe('ScreenFlash', () => {
  it('renders null when inactive', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ScreenFlash isActive={false} />);
    });
    expect(tree!.toJSON()).toBeNull();
    act(() => {
      tree!.unmount();
    });
  });

  it('renders container and overlay when active', () => {
    let testRenderer: renderer.ReactTestRenderer;
    act(() => {
      testRenderer = renderer.create(<ScreenFlash isActive duration={10} />);
    });
    const instance = testRenderer!.root;
    const container = instance.findByProps({ testID: 'screen-flash-container' });
    const overlay = instance.findByProps({ testID: 'screen-flash-overlay' });
    expect(container).toBeTruthy();
    expect(overlay).toBeTruthy();
    act(() => {
      testRenderer!.unmount();
    });
  });

  it('applies provided color', () => {
    let testRenderer: renderer.ReactTestRenderer;
    act(() => {
      testRenderer = renderer.create(<ScreenFlash isActive color="#FF00FF" duration={10} />);
    });
    const overlay = testRenderer!.root.findByProps({ testID: 'screen-flash-overlay' });
    const style = Array.isArray(overlay.props.style)
      ? Object.assign({}, ...overlay.props.style)
      : overlay.props.style;
    expect(style.backgroundColor).toBe('#FF00FF');
    act(() => {
      testRenderer!.unmount();
    });
  });
});
