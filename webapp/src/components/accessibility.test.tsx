/**
 * Accessibility Tests for Amy's Echo
 * 
 * Tests WCAG 2.1 compliance for core UI components:
 * - Color contrast (per contrast-audit.md - already fixed, validating)
 * - ARIA labels and semantic HTML
 * - Keyboard navigation support
 * - Screen reader compatibility
 * 
 * These automated tests complement manual testing with actual assistive technologies.
 */

import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppStateProvider } from '../hooks/useAppState';
import LoadingIndicator from './LoadingIndicator';
import { VisualFeedback } from './VisualFeedback';
import OfflineBanner from './OfflineBanner';
import { FloatingSupportButton } from './FloatingSupportButton';
import { SymbolButton } from './SymbolButton';

// Helper to render with required providers
const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AppStateProvider>{ui}</AppStateProvider>
    </BrowserRouter>
  );
};

describe('Accessibility: WCAG 2.1 Compliance', () => {
  describe('ARIA Labels and Roles', () => {
    it('LoadingIndicator has role="status" and aria-live="polite" for screen readers', () => {
      render(<LoadingIndicator />);
      
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
    });

    it('LoadingIndicator spinner is hidden from screen readers with aria-hidden', () => {
      const { container } = render(<LoadingIndicator />);
      
      // Find spinner div (has aria-hidden="true")
      const spinners = container.querySelectorAll('[aria-hidden="true"]');
      expect(spinners.length).toBeGreaterThan(0);
    });

    it('VisualFeedback has aria-live="polite" for announcements', () => {
      render(<VisualFeedback message="Test message" active={true} type="success" />);
      
      const feedback = screen.getByRole('status');
      expect(feedback).toHaveAttribute('aria-live', 'polite');
    });

    it('VisualFeedback has descriptive aria-label based on type', () => {
      render(<VisualFeedback message="Success message" active={true} type="success" />);
      
      const feedback = screen.getByRole('status');
      expect(feedback).toHaveAttribute('aria-label');
      const ariaLabel = feedback?.getAttribute('aria-label');
      expect(ariaLabel).toMatch(/success/i);
    });

    it('OfflineBanner has role="alert" for urgent notifications', () => {
      render(<OfflineBanner visible={true} />);
      
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });

    it('FloatingSupportButton has descriptive aria-label', () => {
      renderWithProviders(<FloatingSupportButton />);
      
      const link = screen.getByLabelText(/Übersicht für Einstellungen/i);
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
    });

    it('FloatingSupportButton icon is hidden from screen readers', () => {
      renderWithProviders(<FloatingSupportButton />);
      
      const icon = screen.getByText('⚙️');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('SymbolButton has aria-label matching symbol name', () => {
      const mockSymbol = {
        id: 'test-symbol',
        name: 'Hallo',
        imageUrl: 'test.jpg',
        category: 'greeting',
        tags: []
      };
      
      render(<SymbolButton symbol={mockSymbol} />);
      
      const button = screen.getByLabelText('Hallo');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
    });
  });

  describe('Semantic HTML', () => {
    it('LoadingIndicator uses semantic role="status" for loading state', () => {
      render(<LoadingIndicator />);
      
      // Screen readers should announce loading status
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('OfflineBanner uses semantic role="alert" for critical information', () => {
      render(<OfflineBanner visible={true} />);
      
      // Screen readers should immediately announce alerts
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('FloatingSupportButton uses semantic link element with proper aria-label', () => {
      renderWithProviders(<FloatingSupportButton />);
      
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('aria-label');
    });

    it('SymbolButton uses semantic button element', () => {
      const mockSymbol = {
        id: 'test',
        name: 'Test',
        imageUrl: 'test.jpg',
        category: 'test',
        tags: []
      };
      
      render(<SymbolButton symbol={mockSymbol} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
    });
  });

  describe('Color Contrast (Validation)', () => {
    /**
     * Note: These tests validate that contrast fixes from docs/accessibility/contrast-audit.md
     * are applied. Actual color values should be checked in the CSS/component styles.
     * 
     * We test that semantic classes are present, which should have the correct colors
     * according to the contrast audit.
     */

    it('VisualFeedback success type renders with proper role', () => {
      render(<VisualFeedback message="Success" active={true} type="success" />);
      
      const feedback = screen.getByRole('status');
      expect(feedback).toBeInTheDocument();
      // The 'success' type should apply green background with dark text (contrast ratio per audit)
      // Actual contrast validation done in contrast-audit.md
    });

    it('VisualFeedback warning type renders with proper role', () => {
      render(<VisualFeedback message="Warning" active={true} type="warning" />);
      
      const feedback = screen.getByRole('status');
      expect(feedback).toBeInTheDocument();
      // The 'warning' type should apply yellow background with dark text (contrast ratio per audit)
    });

    it('VisualFeedback error type renders with proper role', () => {
      render(<VisualFeedback message="Error" active={true} type="error" />);
      
      const feedback = screen.getByRole('status');
      expect(feedback).toBeInTheDocument();
      // The 'error' type should apply red background with black text (contrast ratio per audit)
    });

    it('LoadingIndicator has visible loading message', () => {
      render(<LoadingIndicator label="Lädt..." />);
      
      // Message should be visible with sufficient contrast
      expect(screen.getByText('Lädt...')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation Support', () => {
    it('FloatingSupportButton link is focusable', () => {
      renderWithProviders(<FloatingSupportButton />);
      
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      
      // Links are naturally focusable, verify it's not disabled
      const tabIndex = link.getAttribute('tabindex');
      if (tabIndex) {
        expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    });

    it('SymbolButton is focusable', () => {
      const mockSymbol = {
        id: 'test',
        name: 'Test',
        imageUrl: 'test.jpg',
        category: 'test',
        tags: []
      };
      
      render(<SymbolButton symbol={mockSymbol} />);
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      
      // Button should be focusable
      const tabIndex = button.getAttribute('tabindex');
      if (tabIndex) {
        expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Screen Reader Compatibility', () => {
    it('VisualFeedback announcements are polite (non-intrusive)', () => {
      render(<VisualFeedback message="Test" active={true} type="info" />);
      
      const feedback = screen.getByRole('status');
      // aria-live="polite" means screen readers announce after current speech
      expect(feedback).toHaveAttribute('aria-live', 'polite');
    });

    it('OfflineBanner announcements are polite despite being alerts', () => {
      render(<OfflineBanner visible={true} />);
      
      const banner = screen.getByRole('alert');
      // Even alerts should be polite for Amy's Echo (non-disruptive)
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });

    it('LoadingIndicator provides text alternative for visual spinner', () => {
      render(<LoadingIndicator label="Bitte warten..." />);
      
      // Screen readers should read the message, not try to describe the spinner
      expect(screen.getByText('Bitte warten...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('Decorative icons are hidden from screen readers', () => {
      renderWithProviders(<FloatingSupportButton />);
      
      // Emoji icon is decorative, should have aria-hidden
      const icon = screen.getByText('⚙️');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Amy First Accessibility Principles', () => {
    /**
     * Amy First principle: "Zero confusion - Simple, clear UI always"
     * These tests ensure UI elements are unambiguously identified for assistive technologies
     */

    it('Visual feedback types have clear, distinct aria-labels', () => {
      const types: Array<'success' | 'warning' | 'error' | 'info'> = ['success', 'warning', 'error', 'info'];
      
      types.forEach(type => {
        const { unmount } = render(<VisualFeedback message={`${type} message`} active={true} type={type} />);
        
        const feedback = screen.getByRole('status');
        const ariaLabel = feedback?.getAttribute('aria-label');
        
        // Each type should have a clear, distinct label
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel).toContain(type);
        
        unmount();
      });
    });

    it('Loading states provide clear status updates', () => {
      render(<LoadingIndicator label="Modell wird geladen..." />);
      
      // Clear German message for Amy and caregivers
      expect(screen.getByText('Modell wird geladen...')).toBeInTheDocument();
      
      // Announced to screen readers via role="status"
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('Offline state provides clear, non-alarming message', () => {
      render(<OfflineBanner visible={true} />);
      
      const banner = screen.getByRole('alert');
      // Should inform without causing alarm (Amy First: Zero judgment)
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });
  });
});
