'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // Check if user recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION_MS) {
        return;
      }
      localStorage.removeItem(DISMISS_KEY);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      promptRef.current = event;
      setDeferredPrompt(event);

      // Show after a slight delay for better UX
      setTimeout(() => {
        setShowPrompt(true);
        // Trigger entrance animation
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      }, 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installHandler = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      promptRef.current = null;
    };
    window.addEventListener('appinstalled', installHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return;

    setIsInstalling(true);

    try {
      await prompt.prompt();
      const result = await prompt.userChoice;

      if (result.outcome === 'accepted') {
        setShowPrompt(false);
      } else {
        // User dismissed the native prompt
        setIsInstalling(false);
      }
    } catch {
      setIsInstalling(false);
    }

    setDeferredPrompt(null);
    promptRef.current = null;
  }, []);

  const handleDismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setShowPrompt(false);
      setIsVisible(false);
      setIsClosing(false);
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }, 300);
  }, []);

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: isVisible && !isClosing
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(-20px)',
        opacity: isVisible && !isClosing ? 1 : 0,
        zIndex: 9999,
        width: '92%',
        maxWidth: 400,
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: isVisible && !isClosing ? 'auto' : 'none',
      }}
      role="dialog"
      aria-label="Install EasyRakh app"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: 'var(--card)',
          borderRadius: 12,
          boxShadow: '0 18px 40px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.10)',
          border: '1px solid var(--border)',
        }}
      >
        {/* App icon */}
        <img
          src="/icon-192x192.png"
          alt="EasyRakh"
          width={32}
          height={32}
          style={{ borderRadius: 8, flexShrink: 0 }}
        />

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.2 }}>
            Install EasyRakh
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.2, marginTop: 1 }}>
            Quick access &amp; works offline
          </div>
        </div>

        {/* Install button */}
        <button
          onClick={handleInstall}
          disabled={isInstalling}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--primary-foreground)',
            background: 'var(--primary)',
            border: 'none',
            borderRadius: 8,
            cursor: isInstalling ? 'not-allowed' : 'pointer',
            opacity: isInstalling ? 0.6 : 1,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { if (!isInstalling) e.currentTarget.style.background = '#0d9488'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--primary)'; }}
        >
          {isInstalling ? (
            <div
              style={{
                width: 14,
                height: 14,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          ) : (
            <Download size={14} />
          )}
          <span>{isInstalling ? 'Installing…' : 'Install'}</span>
        </button>

        {/* Close */}
        <button
          onClick={handleDismiss}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            borderRadius: 6,
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
            color: 'var(--muted-foreground)',
          }}
          aria-label="Dismiss install prompt"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
