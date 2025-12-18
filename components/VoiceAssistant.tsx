'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, X, Volume2, VolumeX, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

// Declare SpeechRecognition types
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

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function VoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const speak = useCallback((text: string, lang: string = 'hi-IN') => {
    if (!synthRef.current || isMuted) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(
      (v) => v.lang.startsWith(lang === 'hi' ? 'hi' : 'en') && v.name.includes('India')
    ) || voices.find((v) => v.lang.startsWith(lang === 'hi' ? 'hi' : 'en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  }, [isMuted]);

  const processQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      text: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process query');
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        text: data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      speak(data.response, data.language);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      
      // Check if it's a rate limit error
      const isRateLimit = errorMessage.toLowerCase().includes('wait') || errorMessage.toLowerCase().includes('rate');
      
      if (isRateLimit) {
        toast.error('⏳ Too many requests! Wait 1 minute.', { duration: 5000 });
      } else {
        toast.error(errorMessage);
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        text: isRateLimit 
          ? '⏳ बहुत जल्दी-जल्दी पूछ रहे हो! एक मिनट रुको। / Too many questions! Please wait 1 minute.'
          : 'क्षमा करें, कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें। / Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  }, [speak]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition not supported in this browser');
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
        processQuery(transcriptText);
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

  // Toggle mute
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
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, []);

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${
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
          <MessageCircle className="w-7 h-7 text-white" />
        </motion.div>
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-amber-900" />
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
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">AI Assistant</h3>
                    <p className="text-slate-200 text-xs">
                      हिंदी & English · Voice Enabled
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-white" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
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

            <div className="h-[320px] overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4 border border-slate-200">
                    <Mic className="w-8 h-8 text-slate-700" />
                  </div>
                  <h4 className="text-gray-900 font-semibold mb-2">
                    Ask me anything!
                  </h4>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Try asking in Hindi or English:
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                      &ldquo;राम का खाता बताओ&rdquo;
                    </p>
                    <p className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                      &ldquo;What&apos;s Sharma&apos;s balance?&rdquo;
                    </p>
                    <p className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                      &ldquo;आज की कुल बिक्री&rdquo;
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
                      className={`flex ${
                        message.type === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                          message.type === 'user'
                            ? 'bg-slate-900 text-white rounded-br-md'
                            : 'bg-white shadow-md border border-gray-100 text-gray-800 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.text}
                        </p>
                        <p
                          className={`text-[10px] mt-1.5 ${
                            message.type === 'user'
                              ? 'text-slate-300'
                              : 'text-gray-400'
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
                  <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">Listening:</span> {transcript}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={clearConversation}
                  disabled={messages.length === 0 || isProcessing}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear
                </button>

                <motion.button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-600'
                      : 'bg-slate-900'
                  } shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`}
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

                  {isProcessing ? (
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                  ) : isListening ? (
                    <MicOff className="w-7 h-7 text-white relative z-10" />
                  ) : (
                    <Mic className="w-7 h-7 text-white" />
                  )}
                </motion.button>

                <div className="flex items-center gap-2">
                  {isSpeaking && (
                    <motion.div
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Volume2 className="w-4 h-4 text-slate-700" />
                      <span className="text-xs text-slate-800 font-medium">Speaking</span>
                    </motion.div>
                  )}
                  {isProcessing && (
                    <motion.div
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 rounded-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Loader2 className="w-4 h-4 text-slate-700 animate-spin" />
                      <span className="text-xs text-slate-800 font-medium">Thinking</span>
                    </motion.div>
                  )}
                </div>
              </div>

              <p className="text-center text-xs text-gray-400 mt-3">
                {isListening
                  ? 'Listening... Tap to stop'
                  : isProcessing
                  ? 'Processing your question...'
                  : 'Tap the mic and ask your question'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


