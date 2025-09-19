import React from 'react';
import { render } from '@testing-library/react-native';
import { HandLandmarkPreview } from '../../src/components/HandLandmarkPreview';

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (styles: any) => styles,
    },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const createElement = (name: string) => (props: any) =>
    React.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: createElement('Svg'),
    Circle: createElement('Circle'),
    Line: createElement('Line'),
    G: createElement('G'),
  };
});

const SINGLE_HAND: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [index / 20, index / 20, 0]) as number[][],
];

const TWO_HANDS: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [index / 20, index / 20, 0]) as number[][],
  Array.from({ length: 21 }, (_, index) => [1 - index / 20, index / 20, 0]) as number[][],
];

describe('HandLandmarkPreview', () => {
  it('renders fallback when no landmarks are provided', () => {
    const { getByText } = render(<HandLandmarkPreview landmarks={[]} />);
    expect(getByText('Hände werden gesucht…')).toBeTruthy();
  });

  it('renders multiple hands with separate landmark groups', () => {
    const { getAllByTestId } = render(
      <HandLandmarkPreview landmarks={TWO_HANDS} handedness={['Left', 'Right']} />,
    );

    const groups = getAllByTestId(/hand-group-/);
    expect(groups).toHaveLength(2);

    const firstHandPoints = getAllByTestId('landmark-0');
    const secondHandPoints = getAllByTestId('landmark-1');
    expect(firstHandPoints).toHaveLength(21);
    expect(secondHandPoints).toHaveLength(21);
  });

  it('mirrors the preview when mirror flag is set', () => {
    const { getAllByTestId } = render(
      <HandLandmarkPreview landmarks={SINGLE_HAND} mirror handedness={['Right']} />,
    );

    const points = getAllByTestId('landmark-0');
    // The first point is at x=0 without mirroring, so with mirroring it should be close to 1
    expect(points[0].props.cx).toBeCloseTo(1, 2);
  });
});
