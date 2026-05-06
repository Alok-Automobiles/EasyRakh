'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ban,
  Camera,
  ImagePlus,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  SendHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  AssistantHindiScript,
  AssistantLanguage,
  AssistantLanguageHint,
} from '@/lib/assistant-language';
import { resolveAssistantLanguageConfig } from '@/lib/assistant-language';
import { ASSISTANT_DATA_UPDATED_EVENT } from '@/lib/assistant-events';
import { compressImage, formatFileSize, isCompressibleImage } from '@/lib/imageCompression';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type AssistantPendingAction =
  | {
      kind: 'cash_entry';
      requiresBillConfirmation: true;
      language: AssistantLanguage;
      script?: AssistantHindiScript;
      summary: string;
      draft: {
        amount: number;
        type: 'in' | 'out';
        description: string;
        date: string;
      };
    }
  | {
      kind: 'ledger_transaction';
      requiresBillConfirmation: true;
      language: AssistantLanguage;
      script?: AssistantHindiScript;
      summary: string;
      draft: {
        entityType: string;
        entityId: string;
        entityName: string;
        entityLabel: string;
        type: 'credit' | 'debit';
        amount: number;
        description: string;
        date: string;
      };
    };

interface AssistantApiResponse {
  success: true;
  response: string;
  language: AssistantLanguage;
  script?: AssistantHindiScript;
  pendingAction?: AssistantPendingAction;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const MAX_BILL_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_BILL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

function normalizeConfirmationText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.,!?;:[\]{}()"']/g, ' ')
    .replace(/\u0964/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesConfirmationPhrase(text: string, phrases: string[]) {
  const normalizedText = normalizeConfirmationText(text);

  if (!normalizedText) {
    return false;
  }

  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeConfirmationText(phrase);

    return (
      normalizedText === normalizedPhrase ||
      normalizedText.startsWith(`${normalizedPhrase} `) ||
      normalizedText.endsWith(` ${normalizedPhrase}`) ||
      normalizedText.includes(` ${normalizedPhrase} `)
    );
  });
}

function isAffirmative(text: string) {
  return matchesConfirmationPhrase(text, [
    'yes',
    'yeah',
    'yep',
    'ok',
    'okay',
    'sure',
    'please do',
    'haan',
    'han',
    'ha',
    'haan ji',
    'han ji',
    'ji haan',
    'ji han',
    'theek hai',
    'thik hai',
    'kar do',
    'kardo',
    'add kar do',
    'add kardo',
    'haan kar do',
    'हाँ',
    'हां',
    'हा',
    'हाँ जी',
    'हां जी',
    'जी हाँ',
    'जी हां',
    'ठीक है',
    'ठिक है',
    'कर दो',
  ]);
}

function isNegative(text: string) {
  return matchesConfirmationPhrase(text, [
    'no',
    'nope',
    'nah',
    'skip',
    'without bill',
    'save without bill',
    'dont attach',
    'do not attach',
    'nahi',
    'nahin',
    'nhi',
    'na',
    'nahi chahiye',
    'bina bill',
    'bill mat lagao',
    'photo mat lagao',
    'mat lagao',
    'नहीं',
    'नही',
    'ना',
    'नहीं चाहिए',
    'बिना बिल',
    'बिल मत लगाओ',
    'फोटो मत लगाओ',
    'मत लगाओ',
  ]);
}

function isCancel(text: string) {
  return matchesConfirmationPhrase(text, [
    'cancel',
    'stop',
    'discard',
    'radd',
    'rad',
    'chhodo',
    'chodo',
    'rehne do',
    'रद्द',
    'छोड़ो',
    'छोडो',
    'रहने दो',
  ]);
}

function createMessage(type: 'user' | 'assistant', text: string): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    text,
    timestamp: new Date(),
  };
}

function getLocalizedText(
  language: AssistantLanguage,
  key: string,
  script: AssistantHindiScript = 'roman'
) {
  if (language === 'hi') {
    if (script === 'devanagari') {
      switch (key) {
        case 'pending_help':
          return 'हाँ, नहीं, या रद्द बोलिए।';
        case 'cancelled':
          return 'ठीक है, मैंने इस ड्राफ्ट को रद्द कर दिया।';
        case 'ask_again':
          return 'इस ड्राफ्ट के लिए हाँ, नहीं, या रद्द बोलिए।';
        case 'choose_bill':
          return 'ठीक है। कैमरा या गैलरी से बिल चुन लीजिए। चाहें तो बिना बिल भी सेव कर सकते हैं।';
        case 'saving':
          return 'इसे अभी सेव कर रहा हूँ...';
        case 'cash_saved':
          return 'नगद एंट्री सेव हो गई है।';
        case 'ledger_saved':
          return 'लेजर एंट्री सेव हो गई है।';
        case 'upload_failed':
          return 'बिल अपलोड नहीं हो पाया। कृपया दोबारा कोशिश कीजिए।';
        case 'save_failed':
          return 'इसे अभी सेव नहीं कर पाया। कृपया दोबारा कोशिश कीजिए।';
        case 'rate_limited':
          return 'अभी बहुत ज़्यादा रिक्वेस्ट आ रही हैं। कृपया एक मिनट बाद फिर कोशिश कीजिए।';
        case 'generic_error':
          return 'माफ कीजिए, कुछ गड़बड़ हो गई। कृपया दोबारा कोशिश कीजिए।';
        case 'unsupported_file_type':
          return 'यह फ़ाइल टाइप सपोर्टेड नहीं है। कृपया JPG, PNG, WEBP, HEIC/HEIF, या PDF इस्तेमाल कीजिए।';
        case 'file_too_large':
          return 'PDF और HEIC फाइल 5MB से छोटी होनी चाहिए। कृपया फाइल साइज़ कम करके फिर कोशिश कीजिए।';
        case 'compressing_image':
          return 'इमेज कॉम्प्रेस कर रहा हूँ...';
        case 'speech_not_supported':
          return 'इस ब्राउज़र में स्पीच रिकग्निशन सपोर्टेड नहीं है।';
        case 'speech_recognition_failed':
          return 'आवाज़ ठीक से समझ नहीं पाया। कृपया फिर से कोशिश कीजिए।';
        case 'clear':
          return 'साफ करें';
        case 'listening':
          return 'सुन रहा हूँ... रोकने के लिए टैप कीजिए';
        case 'processing':
          return 'आपकी रिक्वेस्ट प्रोसेस कर रहा हूँ...';
        case 'tap_mic':
          return 'माइक दबाकर बोलिए या नीचे टाइप कीजिए';
        case 'type_placeholder':
          return 'हिंदी या अंग्रेज़ी में लिखिए...';
        case 'send':
          return 'भेजें';
        case 'speaking':
          return 'बोल रहा हूँ';
        case 'uploading':
          return 'अपलोड हो रहा है';
        case 'thinking':
          return 'सोच रहा हूँ';
        case 'attach_bill_title':
          return 'बिल जोड़िए';
        case 'attach_bill_description':
          return 'बिल इमेज जोड़ने का तरीका चुनिए।';
        case 'open_camera':
          return 'कैमरा खोलिए';
        case 'choose_gallery':
          return 'गैलरी / फाइल्स से चुनिए';
        case 'save_without_bill':
          return 'बिना बिल सेव कीजिए';
        case 'close':
          return 'बंद कीजिए';
        case 'listening_prefix':
          return 'सुन रहा हूँ:';
        case 'type_or_speak':
          return 'लिखिए और बोलिए';
        case 'pending_draft':
          return 'तैयार ड्राफ्ट';
        default:
          return '';
      }
    }

    switch (key) {
      case 'pending_help':
        return 'Haan, nahin, ya radd boliye.';
      case 'cancelled':
        return 'Theek hai, maine is draft ko radd kar diya.';
      case 'ask_again':
        return 'Is draft ke liye haan, nahin, ya radd boliye.';
      case 'choose_bill':
        return 'Theek hai. Kamera ya gallery se bill chun lijiye. Chahein to bina bill bhi save kar sakte hain.';
      case 'saving':
        return 'Ise abhi save kar raha hoon...';
      case 'cash_saved':
        return 'Nagad entry save ho gayi hai.';
      case 'ledger_saved':
        return 'Ledger entry save ho gayi hai.';
      case 'upload_failed':
        return 'Bill upload nahin ho paya. Kripya dobara koshish kijiye.';
      case 'save_failed':
        return 'Ise abhi save nahin kar paya. Kripya dobara koshish kijiye.';
      case 'rate_limited':
        return 'Abhi bahut zyada requests aa rahi hain. Kripya ek minute baad phir koshish kijiye.';
      case 'generic_error':
        return 'Maaf kijiye, kuch gadbad ho gayi. Kripya dobara koshish kijiye.';
      case 'unsupported_file_type':
        return 'Yeh file type supported nahin hai. Kripya JPG, PNG, WEBP, HEIC/HEIF, ya PDF use kijiye.';
      case 'file_too_large':
        return 'PDF aur HEIC file 5MB se chhoti honi chahiye. Kripya file size kam karke phir koshish kijiye.';
      case 'compressing_image':
        return 'Image compress kar raha hoon...';
      case 'speech_not_supported':
        return 'Is browser mein speech recognition supported nahin hai.';
      case 'speech_recognition_failed':
        return 'Aawaz theek se samajh nahin paya. Kripya phir se koshish kijiye.';
      case 'clear':
        return 'Saaf karein';
      case 'listening':
        return 'Sun raha hoon... rokne ke liye tap kijiye';
      case 'processing':
        return 'Aapki request process kar raha hoon...';
      case 'tap_mic':
        return 'Mic dabakar boliye ya neeche type kijiye';
      case 'type_placeholder':
        return 'Hindi ya English mein likhiye...';
      case 'send':
        return 'Bhejiye';
      case 'speaking':
        return 'Bol raha hoon';
      case 'uploading':
        return 'Upload ho raha hai';
      case 'thinking':
        return 'Soch raha hoon';
      case 'attach_bill_title':
        return 'Bill jodiye';
      case 'attach_bill_description':
        return 'Bill image jodne ka tareeka chuniye.';
      case 'open_camera':
        return 'Kamera kholiye';
      case 'choose_gallery':
        return 'Gallery / Files se chuniye';
      case 'save_without_bill':
        return 'Bina bill save kijiye';
      case 'close':
        return 'Band kijiye';
      case 'listening_prefix':
        return 'Sun raha hoon:';
      case 'type_or_speak':
        return 'Likhiye aur boliye';
      case 'pending_draft':
        return 'Taiyar draft';
      default:
        return '';
    }
  }

  switch (key) {
    case 'pending_help':
      return 'Say yes, no, or cancel.';
    case 'cancelled':
      return 'Okay, I cancelled that draft.';
    case 'ask_again':
      return 'For this draft, please say yes, no, or cancel.';
    case 'choose_bill':
      return 'Okay. Choose a bill from camera or gallery. You can also save without a bill.';
    case 'saving':
      return 'Saving it now...';
    case 'cash_saved':
      return 'The cash entry has been saved.';
    case 'ledger_saved':
      return 'The ledger transaction has been saved.';
    case 'upload_failed':
      return 'The bill upload failed. Please try again.';
    case 'save_failed':
      return 'I could not save that just now. Please try again.';
    case 'rate_limited':
      return 'Too many requests right now. Please wait a minute and try again.';
    case 'generic_error':
      return 'Sorry, something went wrong. Please try again.';
    case 'unsupported_file_type':
      return 'Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.';
    case 'file_too_large':
      return 'PDF and HEIC files must be under 5MB. Please reduce the file size and try again.';
    case 'compressing_image':
      return 'Compressing image...';
    case 'speech_not_supported':
      return 'Speech recognition is not supported in this browser.';
    case 'speech_recognition_failed':
      return 'I could not recognize the speech clearly. Please try again.';
    case 'clear':
      return 'Clear';
    case 'listening':
      return 'Listening... Tap to stop';
    case 'processing':
      return 'Processing your request...';
    case 'tap_mic':
      return 'Tap the mic or type your message below';
    case 'type_placeholder':
      return 'Type in Hindi or English...';
    case 'send':
      return 'Send';
    case 'speaking':
      return 'Speaking';
    case 'uploading':
      return 'Uploading';
    case 'thinking':
      return 'Thinking';
    case 'attach_bill_title':
      return 'Attach Bill';
    case 'attach_bill_description':
      return 'Choose how you want to attach the bill image.';
    case 'open_camera':
      return 'Open Camera';
    case 'choose_gallery':
      return 'Choose From Gallery / Files';
    case 'save_without_bill':
      return 'Save Without Bill';
    case 'close':
      return 'Close';
    case 'listening_prefix':
      return 'Listening:';
    case 'type_or_speak':
      return 'Text + Voice';
    case 'pending_draft':
      return 'Pending draft';
    default:
      return '';
  }
}

export default function VoiceAssistant() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [pendingAction, setPendingAction] = useState<AssistantPendingAction | null>(null);
  const [billChooserOpen, setBillChooserOpen] = useState(false);
  const [billUploading, setBillUploading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [languagePreference, setLanguagePreference] = useState<AssistantLanguageHint>('auto');
  const [lastAssistantLanguage, setLastAssistantLanguage] = useState<AssistantLanguage>('hi');
  const [lastHindiScript, setLastHindiScript] = useState<AssistantHindiScript>('roman');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'hi-IN';
      }
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentUiLanguage = useMemo<AssistantLanguage>(() => {
    if (pendingAction) {
      return pendingAction.language;
    }

    if (languagePreference === 'hi' || languagePreference === 'en') {
      return languagePreference;
    }

    return lastAssistantLanguage;
  }, [languagePreference, lastAssistantLanguage, pendingAction]);

  const currentUiScript = useMemo<AssistantHindiScript>(() => {
    if (pendingAction?.language === 'hi') {
      return pendingAction.script || lastHindiScript;
    }

    if (currentUiLanguage === 'hi') {
      return lastHindiScript;
    }

    return 'roman';
  }, [currentUiLanguage, lastHindiScript, pendingAction]);

  const voiceRecognitionLanguage = useMemo(() => {
    if (languagePreference === 'hi') {
      return 'hi-IN';
    }

    if (languagePreference === 'en') {
      return 'en-IN';
    }

    return currentUiLanguage === 'hi' ? 'hi-IN' : 'en-IN';
  }, [currentUiLanguage, languagePreference]);

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const speak = useCallback((text: string, lang: AssistantLanguage = 'hi') => {
    if (!synthRef.current || isMuted) {
      return;
    }

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = synthRef.current.getVoices();
    const preferredVoice =
      voices.find(
        (voice) => voice.lang.startsWith(lang === 'hi' ? 'hi' : 'en') && voice.name.includes('India')
      ) || voices.find((voice) => voice.lang.startsWith(lang === 'hi' ? 'hi' : 'en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  }, [isMuted]);

  const notifyDataUpdate = useCallback((action: AssistantPendingAction) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (action.kind === 'cash_entry') {
      window.dispatchEvent(
        new CustomEvent(ASSISTANT_DATA_UPDATED_EVENT, {
          detail: {
            kind: 'cash_entry',
            date: action.draft.date,
          },
        })
      );
      return;
    }

    window.dispatchEvent(
      new CustomEvent(ASSISTANT_DATA_UPDATED_EVENT, {
        detail: {
          kind: 'ledger_transaction',
          entityType: action.draft.entityType,
          entityId: action.draft.entityId,
          date: action.draft.date,
        },
      })
    );
  }, []);

  const invalidateAppData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    router.refresh();
  }, [queryClient, router]);

  const savePendingAction = useCallback(async (bill?: { billUrl?: string; billPublicId?: string }) => {
    if (!pendingAction) {
      return;
    }

    const actionToSave = pendingAction;
    setIsProcessing(true);

    const actionScript = actionToSave.script || currentUiScript;
    const savingMessage = getLocalizedText(actionToSave.language, 'saving', actionScript);
    appendMessage(createMessage('assistant', savingMessage));
    speak(savingMessage, actionToSave.language);

    try {
      const endpoint =
        actionToSave.kind === 'cash_entry' ? '/api/daily-cash-records' : '/api/transactions';

      const payload =
        actionToSave.kind === 'cash_entry'
          ? {
              ...actionToSave.draft,
              billUrl: bill?.billUrl,
              billPublicId: bill?.billPublicId,
            }
          : {
              entityType: actionToSave.draft.entityType,
              entityId: actionToSave.draft.entityId,
              type: actionToSave.draft.type,
              amount: actionToSave.draft.amount,
              description: actionToSave.draft.description,
              date: actionToSave.draft.date,
              billUrl: bill?.billUrl,
              billPublicId: bill?.billPublicId,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save assistant action');
      }

      setPendingAction(null);
      setBillChooserOpen(false);
      invalidateAppData();
      notifyDataUpdate(actionToSave);

      const successText = getLocalizedText(
        actionToSave.language,
        actionToSave.kind === 'cash_entry' ? 'cash_saved' : 'ledger_saved',
        actionScript
      );
      appendMessage(createMessage('assistant', successText));
      speak(successText, actionToSave.language);
      toast.success(successText);
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : getLocalizedText(actionToSave.language, 'save_failed', actionScript);
      appendMessage(createMessage('assistant', errorText));
      speak(errorText, actionToSave.language);
      toast.error(errorText);
    } finally {
      setIsProcessing(false);
    }
  }, [appendMessage, currentUiScript, invalidateAppData, notifyDataUpdate, pendingAction, router, speak]);

  const uploadBillAndSave = useCallback(async (file: File) => {
    if (!pendingAction) {
      return;
    }

    const actionScript = pendingAction.script || currentUiScript;

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error(getLocalizedText(pendingAction.language, 'unsupported_file_type', actionScript));
      return;
    }

    setBillUploading(true);

    try {
      let fileToUpload = file;

      if (file.size > MAX_BILL_SIZE_BYTES && isCompressibleImage(file)) {
        toast.loading(getLocalizedText(pendingAction.language, 'compressing_image', actionScript), {
          id: 'assistant-bill-compress',
        });
        const compressionResult = await compressImage(file, MAX_BILL_SIZE_BYTES);
        toast.dismiss('assistant-bill-compress');

        if (compressionResult.wasCompressed) {
          fileToUpload = compressionResult.file;
          toast.success(
            `Image compressed: ${formatFileSize(compressionResult.originalSize)} -> ${formatFileSize(compressionResult.compressedSize)}`
          );
        }
      } else if (file.size > MAX_BILL_SIZE_BYTES) {
        toast.error(getLocalizedText(pendingAction.language, 'file_too_large', actionScript));
        return;
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch('/api/uploads/bill', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || getLocalizedText(pendingAction.language, 'upload_failed', actionScript));
      }

      await savePendingAction({
        billUrl: data.url,
        billPublicId: data.publicId,
      });
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : getLocalizedText(pendingAction.language, 'upload_failed', actionScript);
      appendMessage(createMessage('assistant', errorText));
      speak(errorText, pendingAction.language);
      toast.error(errorText);
    } finally {
      setBillUploading(false);
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    }
  }, [appendMessage, currentUiScript, pendingAction, savePendingAction, speak]);

  const handleBillFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await uploadBillAndSave(file);
  }, [uploadBillAndSave]);

  const resolvePendingActionResponse = useCallback(async (query: string) => {
    if (!pendingAction) {
      return false;
    }

    const actionScript = pendingAction.script || currentUiScript;

    appendMessage(createMessage('user', query));

    if (isCancel(query)) {
      const cancelText = getLocalizedText(pendingAction.language, 'cancelled', actionScript);
      setPendingAction(null);
      setBillChooserOpen(false);
      appendMessage(createMessage('assistant', cancelText));
      speak(cancelText, pendingAction.language);
      return true;
    }

    if (isAffirmative(query)) {
      const chooseBillText = getLocalizedText(pendingAction.language, 'choose_bill', actionScript);
      setBillChooserOpen(true);
      appendMessage(createMessage('assistant', chooseBillText));
      speak(chooseBillText, pendingAction.language);
      return true;
    }

    if (isNegative(query)) {
      await savePendingAction();
      return true;
    }

    const askAgainText = getLocalizedText(pendingAction.language, 'ask_again', actionScript);
    appendMessage(createMessage('assistant', askAgainText));
    speak(askAgainText, pendingAction.language);
    return true;
  }, [appendMessage, currentUiScript, pendingAction, savePendingAction, speak]);

  const processQuery = useCallback(async (query: string) => {
    if (!query.trim()) {
      return;
    }

    if (pendingAction) {
      await resolvePendingActionResponse(query);
      setTranscript('');
      return;
    }

    appendMessage(createMessage('user', query));
    setIsProcessing(true);

    try {
      const languageHint = languagePreference === 'auto' ? undefined : languagePreference;
      const response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, languageHint }),
      });

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      const data = (await response.json()) as AssistantApiResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process query');
      }

      setLastAssistantLanguage(data.language);
      if (data.script) {
        setLastHindiScript(data.script);
      }

      appendMessage(createMessage('assistant', data.response));
      setPendingAction(data.pendingAction || null);
      speak(data.response, data.language);
    } catch (error) {
      const detectedConfig = resolveAssistantLanguageConfig(query, languagePreference);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      const isRateLimit =
        errorMessage.toLowerCase().includes('wait') || errorMessage.toLowerCase().includes('rate');
      const isActionableSetupError =
        /GEMINI_API_KEY/i.test(errorMessage) || /not configured/i.test(errorMessage);

      if (isActionableSetupError) {
        toast.error(errorMessage, { duration: 7000 });
        appendMessage(createMessage('assistant', errorMessage));
        speak(errorMessage, 'en');
        return;
      }
      const localizedErrorText = getLocalizedText(
        detectedConfig.language,
        isRateLimit ? 'rate_limited' : 'generic_error',
        detectedConfig.script || 'roman'
      );

      if (isRateLimit) {
        toast.error(localizedErrorText, { duration: 5000 });
      } else {
        toast.error(localizedErrorText);
      }

      appendMessage(createMessage('assistant', localizedErrorText));
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  }, [appendMessage, languagePreference, pendingAction, resolvePendingActionResponse, router, speak]);

  const busy = isProcessing || billUploading || isListening;

  const handleTextSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedValue = inputValue.trim();
    if (!trimmedValue || busy) {
      return;
    }

    setInputValue('');
    void processQuery(trimmedValue);
  }, [busy, inputValue, processQuery]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast.error(getLocalizedText(currentUiLanguage, 'speech_not_supported', currentUiScript));
      return;
    }

    synthRef.current?.cancel();
    setTranscript('');
    setIsListening(true);
    setPulseAnimation(true);
    recognitionRef.current.lang = voiceRecognitionLanguage;

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const results = event.results;
      const latestResult = results[results.length - 1];
      const transcriptText = latestResult[0].transcript;
      setTranscript(transcriptText);

      if (latestResult.isFinal) {
        void processQuery(transcriptText);
        setIsListening(false);
        setPulseAnimation(false);
      }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        toast.error(getLocalizedText(currentUiLanguage, 'speech_recognition_failed', currentUiScript));
      }
      setIsListening(false);
      setPulseAnimation(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      setPulseAnimation(false);
    };

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      setIsListening(false);
      setPulseAnimation(false);
    }
  }, [currentUiLanguage, currentUiScript, processQuery, voiceRecognitionLanguage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setPulseAnimation(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (isSpeaking) {
      synthRef.current?.cancel();
      setIsSpeaking(false);
    }
    setIsMuted((prev) => !prev);
  }, [isSpeaking]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setTranscript('');
    setInputValue('');
    setPendingAction(null);
    setBillChooserOpen(false);
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const footerStatus = pendingAction
    ? getLocalizedText(pendingAction.language, 'pending_help', pendingAction.script || currentUiScript)
    : isListening
      ? getLocalizedText(currentUiLanguage, 'listening', currentUiScript)
      : isProcessing
        ? getLocalizedText(currentUiLanguage, 'processing', currentUiScript)
        : getLocalizedText(currentUiLanguage, 'tap_mic', currentUiScript);

  return (
    <>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={handleBillFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleBillFileChange}
      />

      <motion.button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition-all duration-300 ${
          isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{
          background: '#111827',
          boxShadow: '0 20px 45px rgba(17,24,39,0.25)',
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0 }}
        animate={{ scale: isOpen ? 0 : 1 }}
      >
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <MessageCircle className="h-7 w-7 text-white" />
        </motion.div>
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400">
          <Sparkles className="h-2.5 w-2.5 text-amber-900" />
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-3xl shadow-2xl"
            style={{
              background: 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <div
              className="relative px-5 py-4"
              style={{
                background: '#0f172a',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">AI Assistant</h3>
                    <p className="text-xs text-slate-200">Hindi & English / Text + Voice</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5 text-white" />
                    ) : (
                      <Volume2 className="h-5 w-5 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg bg-white/10 p-2 transition-colors hover:bg-white/20"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>

              {pulseAnimation && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400"
                  animate={{
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              )}
            </div>

            <div className="h-[320px] overflow-y-auto space-y-3 p-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
                    <Mic className="h-8 w-8 text-slate-700" />
                  </div>
                  <h4 className="mb-2 font-semibold text-gray-900">Ask me anything!</h4>
                  <p className="text-sm leading-relaxed text-gray-500">
                    Try typing or asking in Hindi or English:
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">
                      &ldquo;Rajat ka khata batao&rdquo;
                    </p>
                    <p className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">
                      &ldquo;Show Rajat&apos;s ledger&rdquo;
                    </p>
                    <p className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">
                      &ldquo;Aaj ki sale me 200 add karo&rdquo;
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          message.type === 'user'
                            ? 'rounded-br-md bg-slate-900 text-white'
                            : 'rounded-bl-md border border-gray-100 bg-white text-gray-800 shadow-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                        <p
                          className={`mt-1.5 text-[10px] ${
                            message.type === 'user' ? 'text-slate-300' : 'text-gray-400'
                          }`}
                        >
                          {message.timestamp.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))}

                  {pendingAction && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <p className="font-medium">
                        {getLocalizedText(
                          pendingAction.language,
                          'pending_draft',
                          pendingAction.script || currentUiScript
                        )}
                      </p>
                      <p className="mt-1">{pendingAction.summary}</p>
                      <p className="mt-2 text-xs text-amber-700">
                        {getLocalizedText(
                          pendingAction.language,
                          'pending_help',
                          pendingAction.script || currentUiScript
                        )}
                      </p>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <AnimatePresence>
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 pb-2"
                >
                  <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">
                        {getLocalizedText(currentUiLanguage, 'listening_prefix', currentUiScript)}
                      </span>{' '}
                      {transcript}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-gray-100 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-500">
                  {getLocalizedText(currentUiLanguage, 'type_or_speak', currentUiScript)}
                </span>
                <div className="inline-flex rounded-full bg-slate-100 p-1">
                  {(['auto', 'en', 'hi'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setLanguagePreference(mode)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        languagePreference === mode
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mode === 'auto' ? 'Auto' : mode === 'en' ? 'English' : 'Hindi'}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleTextSubmit} className="mb-4 flex items-center gap-2">
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  disabled={busy}
                  placeholder={getLocalizedText(currentUiLanguage, 'type_placeholder', currentUiScript)}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm"
                />
                <Button
                  type="submit"
                  disabled={busy || !inputValue.trim()}
                  className="h-11 rounded-xl bg-slate-900 px-4 text-white hover:bg-slate-800"
                >
                  <SendHorizontal className="mr-2 h-4 w-4" />
                  {getLocalizedText(currentUiLanguage, 'send', currentUiScript)}
                </Button>
              </form>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={clearConversation}
                  disabled={(messages.length === 0 && !pendingAction) || busy}
                  className="rounded-xl px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {getLocalizedText(currentUiLanguage, 'clear', currentUiScript)}
                </button>

                <motion.button
                  onClick={isListening ? stopListening : startListening}
                  disabled={busy}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    isListening ? 'bg-rose-600' : 'bg-slate-900'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isListening && (
                    <>
                      <motion.span
                        className="absolute inset-0 rounded-full bg-rose-400"
                        animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <motion.span
                        className="absolute inset-0 rounded-full bg-rose-400"
                        animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                      />
                    </>
                  )}

                  {busy ? (
                    <Loader2 className="h-7 w-7 animate-spin text-white" />
                  ) : isListening ? (
                    <MicOff className="relative z-10 h-7 w-7 text-white" />
                  ) : (
                    <Mic className="h-7 w-7 text-white" />
                  )}
                </motion.button>

                <div className="flex items-center gap-2">
                  {isSpeaking && (
                    <motion.div
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Volume2 className="h-4 w-4 text-slate-700" />
                      <span className="text-xs font-medium text-slate-800">
                        {getLocalizedText(currentUiLanguage, 'speaking', currentUiScript)}
                      </span>
                    </motion.div>
                  )}
                  {busy && (
                    <motion.div
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
                      <span className="text-xs font-medium text-slate-800">
                        {billUploading
                          ? getLocalizedText(currentUiLanguage, 'uploading', currentUiScript)
                          : getLocalizedText(currentUiLanguage, 'thinking', currentUiScript)}
                      </span>
                    </motion.div>
                  )}
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-gray-400">{footerStatus}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={billChooserOpen} onOpenChange={setBillChooserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {getLocalizedText(
                pendingAction?.language || currentUiLanguage,
                'attach_bill_title',
                pendingAction?.script || currentUiScript
              )}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.summary ||
                getLocalizedText(
                  pendingAction?.language || currentUiLanguage,
                  'attach_bill_description',
                  pendingAction?.script || currentUiScript
                )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => cameraInputRef.current?.click()}
              disabled={billUploading || isProcessing}
            >
              <Camera className="mr-2 h-4 w-4" />
              {getLocalizedText(
                pendingAction?.language || currentUiLanguage,
                'open_camera',
                pendingAction?.script || currentUiScript
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => galleryInputRef.current?.click()}
              disabled={billUploading || isProcessing}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {getLocalizedText(
                pendingAction?.language || currentUiLanguage,
                'choose_gallery',
                pendingAction?.script || currentUiScript
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => void savePendingAction()}
              disabled={billUploading || isProcessing}
            >
              <Ban className="mr-2 h-4 w-4" />
              {getLocalizedText(
                pendingAction?.language || currentUiLanguage,
                'save_without_bill',
                pendingAction?.script || currentUiScript
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBillChooserOpen(false)}
              disabled={billUploading || isProcessing}
            >
              {getLocalizedText(
                pendingAction?.language || currentUiLanguage,
                'close',
                pendingAction?.script || currentUiScript
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
