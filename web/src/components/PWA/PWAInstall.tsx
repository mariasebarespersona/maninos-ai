'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

/**
 * PWA Install Banner + Service Worker Registration
 * 
 * Shows a banner prompting installation on supported devices.
 * Registers the service worker on mount.
 */
export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Safe service worker registration
    if ('serviceWorker' in navigator) {
      // First: unregister any old/stale service workers to avoid InvalidStateError
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          try {
            reg.update().catch(() => {
              // If update fails (e.g. switching HTTP↔HTTPS), unregister
              console.warn('[PWA] Unregistering stale SW:', reg.scope);
              reg.unregister();
            });
          } catch {
            // Safari throws InvalidStateError if newestWorker is null
            console.warn('[PWA] Removing broken SW registration');
            reg.unregister().catch(() => {});
          }
        }
      }).catch(() => {});

      // Then: register fresh service worker (with short delay to avoid race)
      setTimeout(() => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            console.log('[PWA] SW registered:', reg.scope);
            // Force activate new SW if one is waiting
            if (reg.waiting) {
              try {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              } catch {
                // Ignore if postMessage fails
              }
            }
          })
          .catch((err) => console.warn('[PWA] SW registration failed:', err));
      }, 1000);
    }

    // Check if iOS (no beforeinstallprompt on iOS)
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);
    
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return; // Already installed
    
    // Listen for install prompt (Chrome/Edge/Samsung)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    
    // On iOS, show manual instructions if not installed
    if (isIOSDevice && !isStandalone) {
      const dismissed = localStorage.getItem('pwa-ios-dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    }
    
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    if (isIOS) {
      localStorage.setItem('pwa-ios-dismissed', 'true');
    }
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-navy-900 text-white rounded-xl shadow-2xl p-4 flex items-center gap-3 animate-slide-up md:max-w-md md:mx-auto">
      <div className="flex-shrink-0 w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center">
        <Download className="w-5 h-5 text-navy-900" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Instalar Maninos AI</p>
        {isIOS ? (
          <p className="text-xs text-gray-300">
            Toca <span className="inline-block">⬆️</span> y luego &quot;Añadir a pantalla de inicio&quot;
          </p>
        ) : (
          <p className="text-xs text-gray-300">Accede más rápido desde tu pantalla de inicio</p>
        )}
      </div>
      
      {!isIOS && (
        <button
          onClick={handleInstall}
          className="flex-shrink-0 bg-gold-500 text-navy-900 font-bold text-sm px-4 py-2 rounded-lg hover:bg-gold-400 transition-colors"
        >
          Instalar
        </button>
      )}
      
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-gray-400 hover:text-white p-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
