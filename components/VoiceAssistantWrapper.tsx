'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamically import VoiceAssistant to avoid SSR issues with speech APIs
const VoiceAssistant = dynamic(() => import('./VoiceAssistant'), {
  ssr: false,
});

// Pages where the voice assistant should appear (authenticated pages)
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
];

export default function VoiceAssistantWrapper() {
  const pathname = usePathname();

  // Check if current page should show voice assistant
  const shouldShowAssistant = VOICE_ASSISTANT_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );

  if (!shouldShowAssistant) {
    return null;
  }

  return <VoiceAssistant />;
}


