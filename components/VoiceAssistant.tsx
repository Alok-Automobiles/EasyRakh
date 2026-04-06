'use client';

import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
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
      language: 'hi' | 'en';
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
      language: 'hi' | 'en';
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
  language: 'hi' | 'en';
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
    .replace(/।/g, ' ')
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

function getLocalizedText(language: 'hi' | 'en', key: string) {
  if (language === 'hi') {
    switch (key) {
      case 'pending_help':
        return 'Haan/yes, nahi/no, ya cancel boliye.';
      case 'cancelled':
        return 'Theek hai, maine is draft ko cancel kar diya.';
      case 'ask_again':
        return 'Is draft ke liye haan/yes, nahi/no, ya cancel boliye.';
      case 'choose_bill':
        return 'Theek hai. Camera ya gallery se bill chun lijiye. Chahein to skip karke bina bill save bhi kar sakte hain.';
      case 'saving':
        return 'Save kar raha hoon...';
      case 'cash_saved':
        return 'Cash entry save ho gayi.';
      case 'ledger_saved':
        return 'Ledger transaction save ho gayi.';
      case 'upload_failed':
        return 'Bill upload nahi ho paya. Kripya dobara koshish kijiye.';
      case 'save_failed':
        return 'Save nahi ho paya. Kripya dobara koshish kijiye.';
      default:
        return '';
    }
  }

  switch (key) {
    case 'pending_help':
      return 'Say yes/haan, no/nahi, or cancel.';
    case 'cancelled':
      return 'Okay, I cancelled that draft.';
    case 'ask_again':
      return 'For this draft, please say yes/haan, no/nahi, or cancel.';
    case 'choose_bill':
      return 'Okay. Choose a bill from camera or gallery. You can also skip and save without a bill.';
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

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const speak = useCallback((text: string, lang: 'hi' | 'en' = 'hi') => {
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

    const savingMessage = getLocalizedText(actionToSave.language, 'saving');
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
        actionToSave.kind === 'cash_entry' ? 'cash_saved' : 'ledger_saved'
      );
      appendMessage(createMessage('assistant', successText));
      speak(successText, actionToSave.language);
      toast.success(successText);
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : getLocalizedText(actionToSave.language, 'save_failed');
      appendMessage(createMessage('assistant', errorText));
      speak(errorText, actionToSave.language);
      toast.error(errorText);
    } finally {
      setIsProcessing(false);
    }
  }, [appendMessage, invalidateAppData, notifyDataUpdate, pendingAction, speak]);

  const uploadBillAndSave = useCallback(async (file: File) => {
    if (!pendingAction) {
      return;
    }

    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Unsupported file type. Please upload JPG, PNG, WEBP, HEIC/HEIF, or PDF files.');
      return;
    }

    setBillUploading(true);

    try {
      let fileToUpload = file;

      if (file.size > MAX_BILL_SIZE_BYTES && isCompressibleImage(file)) {
        toast.loading('Compressing image...', { id: 'assistant-bill-compress' });
        const compressionResult = await compressImage(file, MAX_BILL_SIZE_BYTES);
        toast.dismiss('assistant-bill-compress');

        if (compressionResult.wasCompressed) {
          fileToUpload = compressionResult.file;
          toast.success(
            `Image compressed: ${formatFileSize(compressionResult.originalSize)} -> ${formatFileSize(compressionResult.compressedSize)}`
          );
        }
      } else if (file.size > MAX_BILL_SIZE_BYTES) {
        toast.error('PDF and HEIC files must be under 5MB. Please reduce the file size manually.');
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
        throw new Error(data.error || getLocalizedText(pendingAction.language, 'upload_failed'));
      }

      await savePendingAction({
        billUrl: data.url,
        billPublicId: data.publicId,
      });
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : getLocalizedText(pendingAction.language, 'upload_failed');
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
  }, [appendMessage, pendingAction, savePendingAction, speak]);

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

    appendMessage(createMessage('user', query));

    if (isCancel(query)) {
      const cancelText = getLocalizedText(pendingAction.language, 'cancelled');
      setPendingAction(null);
      setBillChooserOpen(false);
      appendMessage(createMessage('assistant', cancelText));
      speak(cancelText, pendingAction.language);
      return true;
    }

    if (isAffirmative(query)) {
      const chooseBillText = getLocalizedText(pendingAction.language, 'choose_bill');
      setBillChooserOpen(true);
      appendMessage(createMessage('assistant', chooseBillText));
      speak(chooseBillText, pendingAction.language);
      return true;
    }

    if (isNegative(query)) {
      await savePendingAction();
      return true;
    }

    const askAgainText = getLocalizedText(pendingAction.language, 'ask_again');
    appendMessage(createMessage('assistant', askAgainText));
    speak(askAgainText, pendingAction.language);
    return true;
  }, [appendMessage, pendingAction, savePendingAction, speak]);

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
      const response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = (await response.json()) as AssistantApiResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process query');
      }

      appendMessage(createMessage('assistant', data.response));
      setPendingAction(data.pendingAction || null);
      speak(data.response, data.language);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      const isRateLimit =
        errorMessage.toLowerCase().includes('wait') || errorMessage.toLowerCase().includes('rate');

      if (isRateLimit) {
        toast.error('Too many requests. Please wait a minute.', { duration: 5000 });
      } else {
        toast.error(errorMessage);
      }

      appendMessage(
        createMessage(
          'assistant',
          isRateLimit
            ? 'Too many questions right now. Please wait a minute and try again.'
            : 'Sorry, something went wrong. Please try again.'
        )
      );
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  }, [appendMessage, pendingAction, resolvePendingActionResponse, speak]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition is not supported in this browser');
      return;
    }

    synthRef.current?.cancel();
    setTranscript('');
    setIsListening(true);
    setPulseAnimation(true);

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
        toast.error('Could not recognize speech. Please try again.');
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
  }, [processQuery]);

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
    setPendingAction(null);
    setBillChooserOpen(false);
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  const footerStatus = pendingAction
    ? getLocalizedText(pendingAction.language, 'pending_help')
    : isListening
      ? 'Listening... Tap to stop'
      : isProcessing
        ? 'Processing your request...'
        : 'Tap the mic and ask your question';

  const busy = isProcessing || billUploading;

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
                    <p className="text-xs text-slate-200">Hindi & English · Voice Enabled</p>
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
                  <p className="text-sm leading-relaxed text-gray-500">Try asking in Hindi or English:</p>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">
                      &ldquo;Rajat ka khata batao&rdquo;
                    </p>
                    <p className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700">
                      &ldquo;Kal ka cash record batao&rdquo;
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
                      <p className="font-medium">Pending draft</p>
                      <p className="mt-1">{pendingAction.summary}</p>
                      <p className="mt-2 text-xs text-amber-700">
                        {getLocalizedText(pendingAction.language, 'pending_help')}
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
                      <span className="font-medium">Listening:</span> {transcript}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-gray-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={clearConversation}
                  disabled={(messages.length === 0 && !pendingAction) || busy}
                  className="rounded-xl px-4 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
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
                      <span className="text-xs font-medium text-slate-800">Speaking</span>
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
                        {billUploading ? 'Uploading' : 'Thinking'}
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
            <DialogTitle>Attach Bill</DialogTitle>
            <DialogDescription>
              {pendingAction?.summary || 'Choose how you want to attach the bill image.'}
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
              Open Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => galleryInputRef.current?.click()}
              disabled={billUploading || isProcessing}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Choose From Gallery / Files
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="justify-start"
              onClick={() => void savePendingAction()}
              disabled={billUploading || isProcessing}
            >
              <Ban className="mr-2 h-4 w-4" />
              Save Without Bill
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBillChooserOpen(false)}
              disabled={billUploading || isProcessing}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
