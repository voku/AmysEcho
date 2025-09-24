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

jest.mock('expo-file-system/legacy', () => ({
  Paths: {
    document: { uri: 'file://docs/' },
    cache: { uri: 'file://cache/' },
  },
}));

const SINGLE_HAND: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [0.1 + index / 30, 0.1 + index / 40, 0]) as number[][],
];

const TWO_HANDS: number[][][] = [
  Array.from({ length: 21 }, (_, index) => [0.1 + index / 30, 0.1 + index / 40, 0]) as number[][],
  Array.from({ length: 21 }, (_, index) => [0.9 - index / 30, 0.1 + index / 40, 0]) as number[][],
];

describe('HandLandmarkPreview', () => {
  it('renders fallback when no landmarks are provided', () => {
    const { getByTestId } = render(<HandLandmarkPreview landmarks={[]} />);
    expect(getByTestId('hand-preview-placeholder')).toBeTruthy();
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
    const originalX = SINGLE_HAND[0][0][0];
    expect(points[0].props.cx).toBeCloseTo(1 - originalX, 2);
  });
});
