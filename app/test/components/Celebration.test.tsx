import React from 'react';
import { render } from '@testing-library/react-native';
import Celebration from '../../src/components/Celebration';

jest.mock('../../src/components/AccessibilityContext', () => ({
  useAccessibility: () => ({ largeText: false }),
}));

jest.mock('../../src/context/ThemeContext', () => ({
  useTheme: () => ({ themeName: 'pawPatrol' }),
}));

describe('Celebration', () => {
  it('renders with German accessibility label', () => {
    const { toJSON } = render(<Celebration />);
    const view = toJSON() as any;
    expect(view.props.accessibilityLabel).toMatch(/🐕‍🦺|🐕‍🚒|🐕‍🦼|🐕‍🔧|🐕‍🏗️|🐕‍🏊/); // Paw Patrol character
    expect(view.props.accessibilityRole).toBe('alert');
    expect(view.children?.[0].children).toContain('🎉');
  });
});
