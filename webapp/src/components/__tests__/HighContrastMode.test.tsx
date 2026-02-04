/**
 * High Contrast Mode Tests for Amy's Echo
 * 
 * Tests high contrast mode implementation, system preference detection,
 * and visual consistency when high contrast is enabled.
 * Ensures WCAG 2.1 compliance for contrast requirements.
 * 
 * Reference: docs/planning/TODO.md - Accessibility Testing section
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AccessibilityProvider, useAccessibility } from '../../context/AccessibilityContext';

// Test component that uses the accessibility context
function TestComponent() {
  const { highContrast, setHighContrast } = useAccessibility();
  
  return (
    <div>
      <div data-testid="status">
        {highContrast ? 'High Contrast Enabled' : 'Normal Contrast'}
      </div>
      <button onClick={() => setHighContrast(!highContrast)}>
        Toggle High Contrast
      </button>
    </div>
  );
}

function TestComponentWithStyles() {
  const { highContrast } = useAccessibility();
  
  return (
    <div>
      <div 
        data-testid="styled-element"
        style={{
          backgroundColor: highContrast ? '#000' : '#f5f5f5',
          color: highContrast ? '#fff' : '#333',
          border: highContrast ? '2px solid #fff' : '1px solid #ccc'
        }}
      >
        Sample Element
      </div>
    </div>
  );
}

describe('High Contrast Mode', () => {
  let mockLocalStorage: Record<string, string> = {};
  let mockMatchMedia: any;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockLocalStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockLocalStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockLocalStorage[key];
      },
      clear: () => {
        mockLocalStorage = {};
      },
    });

    // Mock matchMedia
    mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', mockMatchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('High Contrast Enablement', () => {
    it('should start with high contrast disabled by default', () => {
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      const status = screen.getByTestId('status');
      expect(status.textContent).toBe('Normal Contrast');
    });

    it('should enable high contrast when toggled', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      const status = screen.getByTestId('status');
      expect(status.textContent).toBe('High Contrast Enabled');
    });

    it('should disable high contrast when toggled again', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      const button = screen.getByText('Toggle High Contrast');
      
      // Enable
      await user.click(button);
      expect(screen.getByTestId('status').textContent).toBe('High Contrast Enabled');
      
      // Disable
      await user.click(button);
      expect(screen.getByTestId('status').textContent).toBe('Normal Contrast');
    });
  });

  describe('System Preference Detection', () => {
    it('should detect system high contrast preference', () => {
      // Mock system preference for high contrast
      mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(forced-colors: active)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', mockMatchMedia);

      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      // Should automatically enable high contrast based on system preference
      const status = screen.getByTestId('status');
      expect(status.textContent).toBe('High Contrast Enabled');
    });

    it('should respect user preference over system preference', async () => {
      // System prefers high contrast
      mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(forced-colors: active)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', mockMatchMedia);

      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      // System enabled high contrast
      expect(screen.getByTestId('status').textContent).toBe('High Contrast Enabled');

      // User can override and disable it
      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);
      
      expect(screen.getByTestId('status').textContent).toBe('Normal Contrast');
    });
  });

  describe('CSS Class Application', () => {
    it('should apply high-contrast class to document when enabled', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      // Initially no high-contrast class
      expect(document.documentElement.classList.contains('high-contrast')).toBe(false);

      // Enable high contrast
      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      // Wait for class to be applied
      await waitFor(() => {
        expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
      });
    });

    it('should remove high-contrast class when disabled', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      const button = screen.getByText('Toggle High Contrast');
      
      // Enable
      await user.click(button);
      await waitFor(() => {
        expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
      });

      // Disable
      await user.click(button);
      await waitFor(() => {
        expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
      });
    });
  });

  describe('Persistence', () => {
    it('should save high contrast setting to localStorage', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      // Check localStorage was updated
      await waitFor(() => {
        const stored = mockLocalStorage['amy_accessibility_settings'];
        expect(stored).toBeDefined();
        const parsed = JSON.parse(stored);
        expect(parsed.highContrast).toBe(true);
      });
    });

    it('should restore high contrast setting from localStorage', () => {
      // Pre-populate localStorage
      mockLocalStorage['amy_accessibility_settings'] = JSON.stringify({
        highContrast: true,
        largeText: false,
        reducedMotion: false,
      });

      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );

      // Should be enabled from localStorage
      const status = screen.getByTestId('status');
      expect(status.textContent).toBe('High Contrast Enabled');
    });

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('localStorage error');
        },
        setItem: vi.fn(),
      });

      // Should not crash
      expect(() => {
        render(
          <AccessibilityProvider>
            <TestComponent />
          </AccessibilityProvider>
        );
      }).not.toThrow();
    });
  });

  describe('Visual Regression Tests', () => {
    it('should apply different styles in high contrast mode', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <>
            <TestComponent />
            <TestComponentWithStyles />
          </>
        </AccessibilityProvider>
      );

      const styledElement = screen.getByTestId('styled-element');
      
      // Check normal contrast styles (colors can be in hex or rgb format)
      expect(styledElement.style.backgroundColor).toMatch(/#f5f5f5|rgb\(245, 245, 245\)/);
      expect(styledElement.style.color).toMatch(/#333|rgb\(51, 51, 51\)/);
      expect(styledElement.style.border).toMatch(/1px solid/i);

      // Enable high contrast
      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      // Check high contrast styles (colors can be in hex or rgb format)
      await waitFor(() => {
        expect(styledElement.style.backgroundColor).toMatch(/#000|rgb\(0, 0, 0\)/);
        expect(styledElement.style.color).toMatch(/#fff|rgb\(255, 255, 255\)/);
        expect(styledElement.style.border).toMatch(/2px solid/i);
      });
    });

    it('should maintain consistent high contrast styling across re-renders', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <AccessibilityProvider>
          <TestComponentWithStyles />
        </AccessibilityProvider>
      );

      // Enable high contrast
      render(
        <AccessibilityProvider>
          <TestComponent />
        </AccessibilityProvider>
      );
      
      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      // Re-render the styled component
      rerender(
        <AccessibilityProvider>
          <TestComponentWithStyles />
        </AccessibilityProvider>
      );

      // High contrast class should still be applied
      await waitFor(() => {
        expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
      });
    });
  });

  describe('Contrast Ratios', () => {
    it('should provide sufficient contrast for text elements', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <>
            <TestComponent />
            <TestComponentWithStyles />
          </>
        </AccessibilityProvider>
      );

      // Enable high contrast
      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      const styledElement = screen.getByTestId('styled-element');
      
      // In high contrast mode, text should be white on black
      // This provides maximum contrast (21:1)
      await waitFor(() => {
        expect(styledElement.style.backgroundColor).toMatch(/#000|rgb\(0, 0, 0\)/);
        expect(styledElement.style.color).toMatch(/#fff|rgb\(255, 255, 255\)/);
      });
      
      // Note: Actual contrast ratio calculation would require color contrast library
      // This test documents the expected colors for manual verification
    });

    it('should use thick borders in high contrast mode for better visibility', async () => {
      const user = userEvent.setup();
      render(
        <AccessibilityProvider>
          <>
            <TestComponent />
            <TestComponentWithStyles />
          </>
        </AccessibilityProvider>
      );

      const button = screen.getByText('Toggle High Contrast');
      await user.click(button);

      const styledElement = screen.getByTestId('styled-element');
      
      await waitFor(() => {
        // High contrast uses 2px borders instead of 1px
        expect(styledElement.style.border).toContain('2px');
      });
    });
  });

  describe('Integration with Other Accessibility Features', () => {
    it('should work independently from large text setting', async () => {
      const user = userEvent.setup();
      
      function TestWithMultipleSettings() {
        const { highContrast, largeText, setHighContrast, setLargeText } = useAccessibility();
        
        return (
          <div>
            <div data-testid="high-contrast-status">
              High Contrast: {highContrast ? 'On' : 'Off'}
            </div>
            <div data-testid="large-text-status">
              Large Text: {largeText ? 'On' : 'Off'}
            </div>
            <button onClick={() => setHighContrast(!highContrast)}>
              Toggle High Contrast
            </button>
            <button onClick={() => setLargeText(!largeText)}>
              Toggle Large Text
            </button>
          </div>
        );
      }

      render(
        <AccessibilityProvider>
          <TestWithMultipleSettings />
        </AccessibilityProvider>
      );

      // Enable high contrast only
      await user.click(screen.getByText('Toggle High Contrast'));
      
      expect(screen.getByTestId('high-contrast-status').textContent).toBe('High Contrast: On');
      expect(screen.getByTestId('large-text-status').textContent).toBe('Large Text: Off');

      // Enable large text
      await user.click(screen.getByText('Toggle Large Text'));
      
      // Both should be independent
      expect(screen.getByTestId('high-contrast-status').textContent).toBe('High Contrast: On');
      expect(screen.getByTestId('large-text-status').textContent).toBe('Large Text: On');
    });

    it('should apply both high-contrast and large-text classes when both are enabled', async () => {
      const user = userEvent.setup();
      
      function TestWithMultipleSettings() {
        const { setHighContrast, setLargeText } = useAccessibility();
        
        return (
          <div>
            <button onClick={() => setHighContrast(true)}>Enable High Contrast</button>
            <button onClick={() => setLargeText(true)}>Enable Large Text</button>
          </div>
        );
      }

      render(
        <AccessibilityProvider>
          <TestWithMultipleSettings />
        </AccessibilityProvider>
      );

      await user.click(screen.getByText('Enable High Contrast'));
      await user.click(screen.getByText('Enable Large Text'));

      await waitFor(() => {
        expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
        expect(document.documentElement.classList.contains('large-text')).toBe(true);
      });
    });
  });
});
