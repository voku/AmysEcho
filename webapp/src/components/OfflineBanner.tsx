/**
 * Offline Banner Component
 * Displays when the app is offline.
 */

import React, { useEffect, useState } from 'react';

interface OfflineBannerProps {
  visible?: boolean;
}

export default function OfflineBanner({ visible: propVisible }: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showBanner = propVisible ?? isOffline;
  
  if (!showBanner) return null;

  const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'var(--color-warning, #F59E0B)',
    color: '#000',
    textAlign: 'center',
    padding: '0.5rem 1rem',
    fontWeight: 'bold',
    fontSize: '0.875rem',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
  };

  return (
    <div style={bannerStyle} role="alert" aria-live="polite">
      <span aria-hidden="true">📶</span>
      <span>Offline-Modus</span>
    </div>
  );
}
