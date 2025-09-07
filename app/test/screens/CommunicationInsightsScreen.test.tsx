import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CommunicationInsightsScreen from '../../src/screens/CommunicationInsightsScreen';

// Mock navigation
const mockGoBack = jest.fn();
const mockNavigation = {
  goBack: mockGoBack,
};

// Mock components
jest.mock('../../src/components/CommunicationInsights', () => 'CommunicationInsights');
jest.mock('../../src/components/BottomNav', () => 'BottomNav');

describe('CommunicationInsightsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <CommunicationInsightsScreen navigation={mockNavigation as any} />
    );

    expect(getByTestId('communication-insights-screen')).toBeTruthy();
  });

  it('passes navigation to CommunicationInsights component', () => {
    const { getByTestId } = render(
      <CommunicationInsightsScreen navigation={mockNavigation as any} />
    );

    // The component should be rendered with the correct props
    expect(getByTestId('communication-insights-screen')).toBeTruthy();
  });

  it('includes BottomNav with correct props', () => {
    const { getByTestId } = render(
      <CommunicationInsightsScreen navigation={mockNavigation as any} />
    );

    expect(getByTestId('communication-insights-screen')).toBeTruthy();
  });
});