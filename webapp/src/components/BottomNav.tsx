import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

const AUTO_HIDE_BREAKPOINT_PX = 768;
const HIDE_SCROLL_DELTA_PX = 12;
const MIN_SCROLL_POSITION_PX = 24;

// ========================================
// Bottom Navigation - Amy Loop Style
// ========================================
export function BottomNav() {
  const navItems = [
    { to: '/', title: 'Kamera', icon: '🖐️', label: 'Kamera', end: true },
    { to: '/verlauf', title: 'Verlauf', icon: '📜', label: 'Verlauf' },
    { to: '/betreuung', title: 'Betreuung', icon: '👨‍👩‍👧', label: 'Betreuung' },
    { to: '/lernen', title: 'Lernen', icon: '🧠', label: 'Lernen' },
    { to: '/symbole', title: 'Symbole', icon: '🗣️', label: 'Symbole' },
    { to: '/hilfe', title: 'Hilfe', icon: '❓', label: 'Hilfe' },
  ];
  const lastScrollY = useRef(0);
  const prefersAutoHide = useRef(false);
  const scrollTicking = useRef(false);
  const resizeTicking = useRef(false);
  const isHiddenRef = useRef(false);
  const [isHidden, setIsHidden] = useState(false);

  const updateAutoHidePreference = useCallback(() => {
    if (typeof window === 'undefined') return;
    prefersAutoHide.current = window.innerWidth <= AUTO_HIDE_BREAKPOINT_PX;
    if (!prefersAutoHide.current && isHiddenRef.current) {
      isHiddenRef.current = false;
      setIsHidden(false);
    }
  }, []);

  const runScrollEffect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const currentY = window.scrollY;
    if (!prefersAutoHide.current) {
      lastScrollY.current = currentY;
      scrollTicking.current = false;
      return;
    }

    let nextHidden = isHiddenRef.current;

    if (currentY > lastScrollY.current + HIDE_SCROLL_DELTA_PX) {
      nextHidden = true;
    } else if (
      currentY < lastScrollY.current - HIDE_SCROLL_DELTA_PX ||
      currentY < MIN_SCROLL_POSITION_PX
    ) {
      nextHidden = false;
    }

    if (nextHidden !== isHiddenRef.current) {
      isHiddenRef.current = nextHidden;
      setIsHidden(nextHidden);
    }

    lastScrollY.current = currentY;
    scrollTicking.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    lastScrollY.current = window.scrollY;
    updateAutoHidePreference();

    const handleScroll = () => {
      if (!scrollTicking.current) {
        scrollTicking.current = true;
        window.requestAnimationFrame(runScrollEffect);
      }
    };

    const handleResize = () => {
      if (!resizeTicking.current) {
        resizeTicking.current = true;
        window.requestAnimationFrame(() => {
          updateAutoHidePreference();
          resizeTicking.current = false;
        });
      }
    };

    updateAutoHidePreference();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [runScrollEffect, updateAutoHidePreference]);

  const revealNav = () => {
    if (isHiddenRef.current) {
      isHiddenRef.current = false;
      setIsHidden(false);
    }
  };

  return (
    <nav
      className={`bottom-nav${isHidden ? ' bottom-nav-hidden' : ''}`}
      aria-label="Hauptnavigation"
      onMouseEnter={revealNav}
      onFocusCapture={revealNav}
      onTouchStart={revealNav}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          title={item.title}
          {...(item.end ? { end: true } : {})}
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
