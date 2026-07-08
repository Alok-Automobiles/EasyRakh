'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const VoiceAssistant = dynamic(() => import('./VoiceAssistant'), {
  ssr: false,
});

const VOICE_ASSISTANT_PAGES = [
  '/dashboard',
  '/customers',
  '/suppliers',
  '/transactions',
  '/ledger',
  '/notes',
  '/daily-cash-record',
  '/collection-types',
  '/custom-entities',
  '/inventory',
  '/inventory-items',
];

export default function VoiceAssistantWrapper() {
  const pathname = usePathname();
  const [canLoadAssistant, setCanLoadAssistant] = useState(false);

  const shouldShowAssistant = VOICE_ASSISTANT_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );

  useEffect(() => {
    if (!shouldShowAssistant) {
      setCanLoadAssistant(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    const load = () => setCanLoadAssistant(true);

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(load, { timeout: 2500 });
    } else {
      timeoutId = setTimeout(load, 1500);
    }

    return () => {
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [shouldShowAssistant]);

  if (!shouldShowAssistant || !canLoadAssistant) {
    return null;
  }

  return <VoiceAssistant />;
}

