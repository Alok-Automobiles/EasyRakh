'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';

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
    <>
      {/* Backdrop for mobile */}
      <div
        className={`fixed inset-0 bg-black/20 z-[9998] lg:hidden transition-opacity duration-300 ${
          isVisible && !isClosing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleDismiss}
      />

      {/* Install Banner */}
      <div
        className={`fixed z-[9999] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          bottom-4 left-4 right-4
          lg:bottom-auto lg:top-4 lg:left-auto lg:right-4 lg:w-[420px]
          ${isVisible && !isClosing
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-8 opacity-0 scale-95'
          }`}
        role="dialog"
        aria-label="Install EasyRakh app"
      >
        <div className="install-prompt-card relative overflow-hidden rounded-xl bg-white p-0">
          {/* Decorative top accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />

          {/* Shimmer effect */}
          <div className="install-prompt-shimmer absolute inset-0 pointer-events-none" />

          <div className="relative p-4 sm:p-5">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md hover:bg-gray-100 transition-colors group"
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </button>

            <div className="flex items-start gap-3.5">
              {/* App Icon */}
              <div className="install-prompt-icon shrink-0 relative">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden shadow-lg ring-2 ring-black/5">
                  <Image
                    src="/icon-192x192.png"
                    alt="EasyRakh"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                </div>
                {/* Floating sparkle badge */}
                <div className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 shadow-md install-prompt-badge">
                  <Sparkles className="h-3.5 w-3.5 text-black" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pr-5">
                <h3 className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight tracking-tight">
                  Install EasyRakh
                </h3>
                <p className="mt-0.5 text-xs sm:text-sm text-gray-500 leading-snug">
                  Quick access from your home screen — works offline too!
                </p>

                {/* Feature pills */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="install-prompt-pill inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                    <Smartphone className="h-3 w-3" />
                    Instant Access
                  </span>
                  <span className="install-prompt-pill inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200/60">
                    <Download className="h-3 w-3" />
                    Offline Ready
                  </span>
                </div>

                {/* Install button */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="install-prompt-btn group relative inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-gray-800 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isInstalling ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        <span>Installing…</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                        <span>Install App</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors px-2 py-2"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
