'use client';

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
];

export default function VoiceAssistantWrapper() {
  const pathname = usePathname();

  const shouldShowAssistant = VOICE_ASSISTANT_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );

  if (!shouldShowAssistant) {
    return null;
  }

  return <VoiceAssistant />;
}


