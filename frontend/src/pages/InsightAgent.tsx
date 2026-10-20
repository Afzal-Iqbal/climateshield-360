import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { api } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { KARACHI_ZONES } from '../components/ZoneSelector';
import {
  RAGCitation,
  GoldRowItem,
  RagSectionData,
  RAGAnswerData,
} from '../types';

interface InsightAgentProps {
  isSample?: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  zone_id?: string;
  zone_name?: string;
  timestamp: Date;
  citations?: RAGCitation[];
  row_ids?: string[];
  limits?: string;
  supported?: boolean;
  missing?: string[];
  latencyMs?: number;
  sourcesCount?: number;
  rowsCount?: number;
  isError?: boolean;
  errorMsg?: string;
  retryQuestion?: string;
}

const DEFAULT_SUGGESTIONS = [
  'What should people do in a heatwave according to NDMA?',
  'What does the latest PMD flood bulletin say?',
  'What does WHO say about signs of heat stroke?',
  'What are the heat and rain risk levels for Malir?',
];

const FALLBACK_EXAMPLES = [
  'What should people do in a heatwave according to NDMA?',
  'What does the latest PMD flood bulletin say?',
  'What are the heat and rain risk levels for Malir?',
];

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = true }) => {
  const [searchParams] = useSearchParams();
  const shouldReduceMotion = useReducedMotion();

  // Zone selection from top bar selector
  const currentZoneId = searchParams.get('zone') || searchParams.get('zone_id') || 'all';
  const selectedZone = KARACHI_ZONES.find((z) => z.id === currentZoneId) || KARACHI_ZONES[0];
  const zoneQueryParam = selectedZone.id === 'all' ? 'Karachi' : selectedZone.id;

  // Session Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  // In-flight abort controller for Stop generation
  const abortControllerRef = useRef<AbortController | null>(null);

  // References for scroll and textarea
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Citation slide-over side panel / bottom sheet state
  const [activeCitation, setActiveCitation] = useState<RAGCitation | null>(null);
  const [sectionData, setSectionData] = useState<RagSectionData | null>(null);
  const [isLoadingSection, setIsLoadingSection] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  // Gold Row popover table state
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [rowDetails, setRowDetails] = useState<GoldRowItem | null>(null);
  const [isLoadingRow, setIsLoadingRow] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Clear chat modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Marker and Source Chip hover sync
  const [hoveredCitationKey, setHoveredCitationKey] = useState<string | null>(null);

  // Copy feedback and User Ratings (local only)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});

  // Auto-scroll on new message or status change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Adjust textarea height up to ~6 lines
  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  // Close modals on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveCitation(null);
        setActiveRowId(null);
        setShowClearConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Section Text when activeCitation changes
  useEffect(() => {
    if (!activeCitation) {
      setSectionData(null);
      setSectionError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingSection(true);
    setSectionError(null);

    api
      .getRagSection(activeCitation.document, activeCitation.section)
      .then((res) => {
        if (isMounted) {
          setSectionData(res.data);
          setIsLoadingSection(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setSectionError(err.message || 'Failed to load section text from server.');
          setIsLoadingSection(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeCitation]);

  // Fetch Gold Row when activeRowId changes
  useEffect(() => {
    if (!activeRowId) {
      setRowDetails(null);
      setRowError(null);
      return;
    }

    let isMounted = true;
    setIsLoadingRow(true);
    setRowError(null);

    api
      .getRows([activeRowId])
      .then((res) => {
        if (isMounted) {
          const match = res.data.rows.find((r) => r.row_id === activeRowId) || res.data.rows[0];
          setRowDetails(match || null);
          setIsLoadingRow(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setRowError(err.message || 'Failed to load gold row record.');
          setIsLoadingRow(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeRowId]);

  // Main Submit Handler
  const handleSend = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;

    // Immediately clear input and reset textarea height
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }

    // Save for up-arrow recall
    setLastQuestion(trimmed);

    // Hide suggestions after the first message
    setShowSuggestions(false);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now() + 1}`;

    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      text: trimmed,
      zone_id: zoneQueryParam,
      zone_name: selectedZone.shortName,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const response = await api.askRag(
        {
          question: trimmed,
          zone_id: zoneQueryParam,
          temperature: 0.0,
        },
        controller.signal
      );

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      const data: RAGAnswerData = response.data;

      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        sender: 'assistant',
        text: data.text,
        citations: data.citations || [],
        row_ids: data.row_ids || [],
        limits: data.limits,
        supported: data.supported,
        missing: data.missing || [],
        latencyMs: latency,
        sourcesCount: data.citations?.length || 0,
        rowsCount: data.row_ids?.length || 0,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        // Cancelled by user - do not display an error
        return;
      }
      const errorMsg: ChatMessage = {
        id: assistantMessageId,
        sender: 'assistant',
        text: '',
        isError: true,
        errorMsg: err.detail || err.message || 'The AI assistant request failed or timed out.',
        retryQuestion: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  // Stop Generation handler
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Keyboard handler for controlled textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowUp' && input === '' && lastQuestion) {
      e.preventDefault();
      setInput(lastQuestion);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Guard against IME composition
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSend(input);
    }
  };

  // Copy Answer with citations
  const handleCopyAnswer = (msg: ChatMessage) => {
    let copyText = msg.text;
    if (msg.citations && msg.citations.length > 0) {
      copyText += '\n\nSources:\n';
      msg.citations.forEach((cit, idx) => {
        copyText += `[${idx + 1}] ${cit.document} (${cit.section})\n`;
      });
    }
    if (msg.row_ids && msg.row_ids.length > 0) {
      copyText += `\nGold row IDs: ${msg.row_ids.join(', ')}\n`;
    }
    if (msg.limits) {
      copyText += `\nNotice: ${msg.limits}\n`;
    }

    navigator.clipboard.writeText(copyText).then(() => {
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  // Toggle user feedback rating
  const handleRate = (messageId: string, rating: 'up' | 'down') => {
    setFeedback((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === rating ? undefined : rating,
    } as Record<string, 'up' | 'down'>));
  };

  // Clear chat handler
  const handleConfirmClear = () => {
    setMessages([]);
    setShowClearConfirm(false);
    setShowSuggestions(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Scroll to citation chip from inline numbered marker
  const scrollToCitation = (msgId: string, citationIdx: number) => {
    const chipEl = document.getElementById(`citation-${msgId}-${citationIdx}`);
    if (chipEl) {
      chipEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      chipEl.classList.add('ring-2', 'ring-secondary');
      setTimeout(() => {
        chipEl.classList.remove('ring-2', 'ring-secondary');
      }, 1500);
    }
  };

  // Render text containing inline numbered markers [1], [2]
  const renderMessageContent = (msg: ChatMessage) => {
    const parts = msg.text.split(/(\[\d+\])/g);
    return (
      <span className="leading-relaxed">
        {parts.map((part, index) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const citNumber = parseInt(match[1], 10);
            const citIdx = citNumber - 1;
            const citItem = msg.citations && msg.citations[citIdx];
            const key = `${msg.id}-${citIdx}`;
            const isHovered = hoveredCitationKey === key;

            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  scrollToCitation(msg.id, citIdx);
                  if (citItem) setActiveCitation(citItem);
                }}
                onMouseEnter={() => setHoveredCitationKey(key)}
                onMouseLeave={() => setHoveredCitationKey(null)}
                title={citItem ? `Source [${citNumber}]: ${citItem.document} - ${citItem.section}` : `Source [${citNumber}]`}
                className={`inline-flex items-center justify-center font-mono text-[11px] font-bold px-1.5 py-0.5 mx-0.5 rounded transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-secondary text-on-secondary shadow-xs scale-105'
                    : 'bg-secondary/15 dark:bg-secondary/25 text-secondary hover:bg-secondary/30'
                }`}
                aria-label={`Jump to citation ${citNumber}`}
              >
                [{citNumber}]
              </button>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  };

  // Check if message mentions health or emergency
  const isHealthContext = (msg: ChatMessage) => {
    const combined = `${msg.text} ${msg.limits || ''}`.toLowerCase();
    return (
      combined.includes('heat') ||
      combined.includes('stroke') ||
      combined.includes('emergency') ||
      combined.includes('rescue') ||
      combined.includes('1122') ||
      combined.includes('health') ||
      combined.includes('hospital')
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
      <SampleBanner isSample={isSample} />

      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/30 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[24px]">auto_awesome</span>
            <h1 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface tracking-tight">
              AI Decision Support &amp; Climate Assistant
            </h1>
          </div>
          <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Strictly grounded in verified emergency guidelines &amp; DuckDB warehouse gold tables. Numbers are exact and citations link to official source manifests.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Active District Indicator */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container dark:bg-surface-container-high border border-outline-variant/40 font-mono text-[11px] text-on-surface"
            title="Selected Zone for queries"
          >
            <span className="material-symbols-outlined text-[14px] text-secondary">location_on</span>
            <span className="font-semibold">{selectedZone.name}</span>
          </div>

          {/* Clear Chat Button */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-outline-variant/40 hover:bg-surface-container dark:hover:bg-surface-container-high text-xs text-on-surface-variant transition-colors min-h-[36px]"
              title="Clear current session chat history"
              aria-label="Clear chat history"
            >
              <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* Toggle Suggestions Button */}
          {messages.length > 0 && !showSuggestions && (
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-secondary/40 bg-secondary/10 hover:bg-secondary/20 text-xs text-secondary font-medium transition-colors min-h-[36px]"
              aria-label="Show suggested questions"
            >
              <span className="material-symbols-outlined text-[16px]">lightbulb</span>
              <span className="hidden sm:inline">Suggestions</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* CHAT THREAD LOG (role="log", aria-live="polite")             */}
      {/* ============================================================ */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Climate Assistant Conversation"
        className="flex-1 overflow-y-auto flex flex-col gap-4 sm:gap-6 min-h-[320px] pb-6"
      >
        {/* Welcome Empty State */}
        {messages.length === 0 && (
          <div className="my-auto py-8 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-secondary/15 flex items-center justify-center text-secondary mb-3 shadow-xs">
              <span className="material-symbols-outlined text-[28px]">shield</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-on-surface">
              Ask Karachi ClimateShield
            </h2>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1 max-w-md">
              Ask about localized extreme heat, heavy monsoon rainfall risk, population exposure, or official emergency standard operating procedures.
            </p>
          </div>
        )}

        {/* Message Thread */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            if (msg.sender === 'user') {
              return (
                <motion.div
                  key={msg.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col items-end self-end max-w-full sm:max-w-[720px] gap-1"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {msg.zone_name && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/30 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px] text-secondary">location_on</span>
                        {msg.zone_name}
                      </span>
                    )}
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="bg-primary text-on-primary rounded-2xl rounded-tr-xs px-4 py-3 shadow-xs font-body-md text-sm sm:text-base leading-relaxed break-words max-w-full">
                    {msg.text}
                  </div>
                </motion.div>
              );
            }

            // Error Bubble with Retry
            if (msg.isError) {
              return (
                <motion.div
                  key={msg.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col items-start self-start w-full sm:max-w-[720px]"
                >
                  <div
                    className="w-full rounded-2xl rounded-tl-xs border border-error/40 bg-error-container/20 p-4 text-on-surface shadow-xs flex flex-col gap-3"
                    role="alert"
                  >
                    <div className="flex items-center gap-2 text-error font-semibold text-xs sm:text-sm">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      <span>Request Error</span>
                    </div>
                    <p className="text-xs sm:text-sm text-on-surface">{msg.errorMsg}</p>
                    {msg.retryQuestion && (
                      <button
                        type="button"
                        onClick={() => handleSend(msg.retryQuestion!)}
                        className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error text-on-error font-semibold text-xs hover:opacity-90 transition-opacity min-h-[44px]"
                        aria-label="Retry failed question"
                      >
                        <span className="material-symbols-outlined text-[16px]">refresh</span>
                        Retry question
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            }

            // Assistant Card: Unsupported / Neutral Not Enough Evidence (Requirement 13)
            if (msg.supported === false) {
              return (
                <motion.div
                  key={msg.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col items-start self-start w-full sm:max-w-[720px]"
                >
                  <div className="w-full rounded-2xl rounded-tl-xs border border-outline-variant/40 bg-surface-container-low dark:bg-surface-container p-4 sm:p-5 shadow-xs flex flex-col gap-4 text-on-surface">
                    <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                          help_center
                        </span>
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                          Not enough evidence
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        STRICT FACTUAL GUARDRAIL
                      </span>
                    </div>

                    <div className="text-sm font-body-md text-on-surface leading-relaxed">
                      {msg.text || 'I do not have sufficient authoritative data to answer this specific query.'}
                    </div>

                    {msg.missing && msg.missing.length > 0 && (
                      <div className="bg-surface-container/60 dark:bg-surface-container-high/60 rounded-xl p-3 border border-outline-variant/20 text-xs">
                        <span className="font-semibold text-on-surface block mb-1">What is missing:</span>
                        <ul className="list-disc list-inside text-on-surface-variant space-y-0.5">
                          {msg.missing.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Try Asking Examples */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-xs font-semibold text-on-surface-variant">Try asking:</span>
                      <div className="flex flex-wrap gap-2">
                        {FALLBACK_EXAMPLES.map((example) => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => handleSend(example)}
                            className="text-left px-2.5 py-1.5 rounded-lg border border-outline-variant/40 bg-surface dark:bg-surface-container-lowest text-xs text-secondary hover:bg-secondary/10 transition-colors min-h-[36px]"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Emergency Service Pointer */}
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container/40 p-2.5 rounded-lg border border-outline-variant/20">
                      <span className="material-symbols-outlined text-[16px] text-amber-500">emergency</span>
                      <span>
                        For active emergencies, contact official services: <strong>Sindh PDMA (1736)</strong> or <strong>Rescue 1122</strong>.
                      </span>
                    </div>

                    {/* Footer Metrics */}
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono pt-1 border-t border-outline-variant/20">
                      <span>⚡ {msg.latencyMs || 0}ms · 0 sources cleared threshold</span>
                      <button
                        type="button"
                        onClick={() => handleCopyAnswer(msg)}
                        className="hover:text-on-surface flex items-center gap-1 transition-colors min-h-[32px] px-2"
                        aria-label="Copy answer"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedMessageId === msg.id ? 'check' : 'content_copy'}
                        </span>
                        {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            }

            // Assistant Card: Full Supported Answer Card (Requirements 9, 10, 11, 12, 14, 15)
            return (
              <motion.div
                key={msg.id}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-start self-start w-full sm:max-w-[720px]"
              >
                <div className="w-full rounded-2xl rounded-tl-xs border border-outline-variant/30 bg-surface-container-lowest dark:bg-surface-container p-4 sm:p-5 shadow-xs flex flex-col gap-4 text-on-surface">
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-secondary/15 flex items-center justify-center text-secondary">
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-secondary uppercase tracking-wider">
                        Official Decision Support
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-on-surface-variant">
                      {/* Thumbs Up / Down */}
                      <button
                        type="button"
                        onClick={() => handleRate(msg.id, 'up')}
                        title="Helpful response"
                        className={`p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                          feedback[msg.id] === 'up'
                            ? 'bg-secondary/20 text-secondary'
                            : 'hover:bg-surface-container text-on-surface-variant'
                        }`}
                        aria-label="Thumbs up"
                      >
                        <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRate(msg.id, 'down')}
                        title="Not helpful"
                        className={`p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ${
                          feedback[msg.id] === 'down'
                            ? 'bg-error/20 text-error'
                            : 'hover:bg-surface-container text-on-surface-variant'
                        }`}
                        aria-label="Thumbs down"
                      >
                        <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                      </button>

                      {/* Copy Answer Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyAnswer(msg)}
                        title="Copy answer with citations"
                        className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center ml-1"
                        aria-label="Copy answer with citations"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {copiedMessageId === msg.id ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Answer Text with Inline Citations [1], [2] */}
                  <div className="font-body-md text-sm sm:text-base text-on-surface leading-relaxed">
                    {renderMessageContent(msg)}
                  </div>

                  {/* Sources Section (Requirement 9 & 10) */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/20">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                        <span className="material-symbols-outlined text-[15px] text-secondary">library_books</span>
                        <span>Sources &amp; Citations:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cit, idx) => {
                          const key = `${msg.id}-${idx}`;
                          const isHovered = hoveredCitationKey === key;
                          return (
                            <button
                              key={idx}
                              id={`citation-${msg.id}-${idx}`}
                              type="button"
                              onClick={() => setActiveCitation(cit)}
                              onMouseEnter={() => setHoveredCitationKey(key)}
                              onMouseLeave={() => setHoveredCitationKey(null)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-all text-left min-h-[44px] ${
                                isHovered
                                  ? 'bg-secondary/20 border-secondary text-on-surface ring-2 ring-secondary/30 scale-102'
                                  : 'bg-surface dark:bg-surface-container-high border-outline-variant/40 text-on-surface hover:bg-surface-container'
                              }`}
                              title="Click to view full cited section and official document link"
                              aria-label={`View citation [${idx + 1}] ${cit.document}`}
                            >
                              <span className="font-mono font-bold text-secondary text-xs">[{idx + 1}]</span>
                              <span className="font-medium truncate max-w-[180px] sm:max-w-[240px]">
                                {cit.document.replace('.pdf', '')}
                              </span>
                              {cit.section && (
                                <span className="text-on-surface-variant truncate max-w-[140px] hidden sm:inline">
                                  · {cit.section}
                                </span>
                              )}
                              <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">
                                open_in_new
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Data Used Section (Requirement 11) */}
                  {msg.row_ids && msg.row_ids.length > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                        <span className="material-symbols-outlined text-[15px] text-secondary">table_view</span>
                        <span>Data used (DuckDB gold rows):</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.row_ids.map((rowId, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveRowId(rowId)}
                            className="font-mono text-[11px] px-2.5 py-1.5 rounded-lg bg-surface dark:bg-surface-container-high border border-outline-variant/40 hover:border-secondary hover:text-secondary text-on-surface transition-colors flex items-center gap-1.5 min-h-[36px]"
                            title="Click to inspect exact warehouse row record in table popover"
                            aria-label={`Inspect row ${rowId}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                            <span className="truncate max-w-[220px]">{rowId}</span>
                            <span className="material-symbols-outlined text-[13px] text-on-surface-variant">
                              info
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Limits Note & Emergency Pointer (Requirement 12) */}
                  <div className="bg-surface-container/50 dark:bg-surface-container-high/40 rounded-xl p-3 border border-outline-variant/20 flex flex-col gap-1.5 text-xs">
                    {msg.limits && (
                      <div className="text-on-surface-variant flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-on-surface-variant shrink-0 mt-0.5">
                          info
                        </span>
                        <span>{msg.limits}</span>
                      </div>
                    )}

                    {isHealthContext(msg) && (
                      <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/20 text-on-surface">
                        <span className="material-symbols-outlined text-[16px] text-error shrink-0">
                          health_and_safety
                        </span>
                        <span>
                          <strong>Emergency protocol:</strong> In case of heat stroke or acute distress, contact <strong>Rescue 1122</strong> or <strong>Sindh PDMA 1736</strong> immediately.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Telemetry Footer (Requirement 15) */}
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant font-mono pt-1 border-t border-outline-variant/20">
                    <span>
                      ⚡ {msg.latencyMs || 0}ms · {msg.sourcesCount || 0} sources · {msg.rowsCount || 0} gold rows
                    </span>
                    <span className="text-[10px]">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Thinking State Bubble (Requirement 5 & 18) */}
        {isLoading && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            className="flex flex-col items-start self-start w-full sm:max-w-[720px]"
          >
            <div className="rounded-2xl rounded-tl-xs border border-outline-variant/30 bg-surface-container-lowest dark:bg-surface-container p-4 shadow-xs flex items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-3">
                {/* Animated Bouncing Dots */}
                <div className="flex items-center gap-1 py-1" aria-hidden="true">
                  <motion.span
                    animate={shouldReduceMotion ? {} : { y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                    className="w-2 h-2 rounded-full bg-secondary inline-block"
                  />
                  <motion.span
                    animate={shouldReduceMotion ? {} : { y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                    className="w-2 h-2 rounded-full bg-secondary inline-block"
                  />
                  <motion.span
                    animate={shouldReduceMotion ? {} : { y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                    className="w-2 h-2 rounded-full bg-secondary inline-block"
                  />
                </div>
                <span className="text-xs sm:text-sm text-on-surface font-medium animate-pulse">
                  Retrieving sources and gold rows…
                </span>
              </div>

              {/* Stop Button (Requirement 5) */}
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container text-xs font-semibold text-on-surface transition-colors min-h-[44px]"
                aria-label="Stop generating response"
              >
                <span className="material-symbols-outlined text-[16px] text-error">stop_circle</span>
                <span>Stop</span>
              </button>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ============================================================ */}
      {/* SUGGESTION CHIPS (Requirement 6)                             */}
      {/* ============================================================ */}
      {showSuggestions && (
        <div className="pb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold mr-1">
            Suggested:
          </span>
          {DEFAULT_SUGGESTIONS.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => handleSend(sug)}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-full border border-outline-variant/40 bg-surface dark:bg-surface-container text-xs text-on-surface hover:border-secondary hover:text-secondary hover:bg-surface-container transition-all text-left shadow-2xs min-h-[44px] flex items-center"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* STICKY BOTTOM INPUT BAR (Requirements 2, 3, 4, 7, 8, 16)      */}
      {/* ============================================================ */}
      <div className="sticky bottom-0 z-30 pt-2 pb-3 sm:pb-4 bg-background/95 backdrop-blur-md border-t border-outline-variant/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex items-end gap-2 bg-surface-container-lowest dark:bg-surface-container rounded-2xl p-2 sm:p-2.5 border border-outline-variant/40 shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all"
        >
          {/* Controlled Auto-Growing Textarea */}
          <textarea
            ref={textareaRef}
            id="chat-input-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            aria-label="Ask about heat, rain, risk areas, or data sources"
            placeholder="Ask about heat, rain, risk areas, or data sources..."
            className="flex-1 bg-transparent border-0 outline-none resize-none px-2 py-2 text-on-surface font-body-md text-sm sm:text-base placeholder:text-on-surface-variant/60 min-h-[44px] max-h-[140px] focus:ring-0"
          />

          {/* Action Button: Send or Spinner */}
          <button
            type="submit"
            disabled={isLoading || input.trim() === ''}
            className="shrink-0 min-h-[44px] min-w-[44px] px-3 sm:px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-opacity hover:opacity-95"
            aria-label={isLoading ? 'Thinking…' : 'Send question'}
          >
            {isLoading ? (
              <span
                className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin inline-block"
                aria-hidden="true"
              />
            ) : (
              <>
                <span className="hidden sm:inline">Ask</span>
                <span className="material-symbols-outlined text-[18px]">send</span>
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-mono px-2 pt-1.5">
          <span>Enter to send · Shift+Enter for new line · ↑ to recall previous</span>
          <span className="hidden sm:inline">Target zone: {selectedZone.name}</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CITATION MODAL / SLIDE-OVER PANEL / BOTTOM SHEET (Req 9, 16) */}
      {/* ============================================================ */}
      <AnimatePresence>
        {activeCitation && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveCitation(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />

            {/* Desktop Slide Panel & Mobile Bottom Sheet */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { x: '100%' }}
              animate={shouldReduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="relative z-10 w-full sm:w-[460px] max-w-full bg-surface-container-lowest dark:bg-surface-container-high h-full shadow-2xl flex flex-col border-l border-outline-variant/30"
              role="dialog"
              aria-modal="true"
              aria-label="Citation Section Details"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-outline-variant/30 flex items-start justify-between gap-3 bg-surface-container-low dark:bg-surface-container">
                <div>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-bold uppercase tracking-wider">
                    Official Document Source
                  </span>
                  <h3 className="font-bold text-base sm:text-lg text-on-surface mt-1.5 leading-snug">
                    {sectionData?.document_title || activeCitation.document}
                  </h3>
                  <p className="font-mono text-xs text-on-surface-variant mt-0.5">
                    {sectionData?.publisher || 'Official Library'} · Section: {activeCitation.section}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCitation(null)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Close citation details"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 text-on-surface">
                {isLoadingSection && (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
                    <span className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Loading stored chunk text from ChromaDB…</span>
                  </div>
                )}

                {sectionError && (
                  <div className="p-4 rounded-xl bg-error-container/20 border border-error/30 text-xs text-on-surface">
                    {sectionError}
                  </div>
                )}

                {sectionData && !isLoadingSection && (
                  <>
                    <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant border-b border-outline-variant/20 pb-2">
                      <span>Document: {sectionData.document}</span>
                      {sectionData.page && <span>Page: {sectionData.page}</span>}
                    </div>

                    <div className="bg-surface dark:bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 font-body-md text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                      {sectionData.text}
                    </div>

                    {/* Official Manifest Document Link (Requirement 9) */}
                    {sectionData.source_url ? (
                      <div className="mt-auto pt-4 border-t border-outline-variant/20">
                        <a
                          href={sectionData.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-secondary text-on-secondary font-semibold text-xs sm:text-sm shadow-xs hover:opacity-90 transition-opacity min-h-[44px]"
                        >
                          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                          <span>Open original document source URL</span>
                        </a>
                      </div>
                    ) : (
                      <div className="mt-auto pt-4 border-t border-outline-variant/20 text-center text-xs text-on-surface-variant">
                        Archived in verified offline disaster library.
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* GOLD ROW TABLE POPOVER / MODAL (Requirement 11)              */}
      {/* ============================================================ */}
      <AnimatePresence>
        {activeRowId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveRowId(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { scale: 0.95, opacity: 0 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 w-full max-w-xl bg-surface-container-lowest dark:bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[85vh] overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Gold Row Record Details"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-outline-variant/30 flex items-center justify-between gap-3 bg-surface-container-low dark:bg-surface-container">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[20px]">table_chart</span>
                    <h3 className="font-bold text-base text-on-surface">Warehouse Row Record</h3>
                  </div>
                  <p className="font-mono text-xs text-on-surface-variant mt-0.5 truncate max-w-md">
                    {activeRowId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRowId(null)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Close row details"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {isLoadingRow && (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                    <span className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Fetching DuckDB row verbatim…</span>
                  </div>
                )}

                {rowError && (
                  <div className="p-3 rounded-lg bg-error-container/20 border border-error/30 text-xs text-on-surface">
                    {rowError}
                  </div>
                )}

                {rowDetails && !isLoadingRow && (
                  <div className="border border-outline-variant/30 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-container dark:bg-surface-container-highest border-b border-outline-variant/30 font-mono text-[11px] text-on-surface-variant uppercase">
                          <th className="p-2.5 font-semibold">Column Field</th>
                          <th className="p-2.5 font-semibold">Gold Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20 font-mono">
                        {Object.entries(rowDetails.fields).map(([key, value]) => (
                          <tr key={key} className="hover:bg-surface-container/50 transition-colors">
                            <td className="p-2.5 font-medium text-on-surface-variant">{key}</td>
                            <td className="p-2.5 font-semibold text-on-surface">
                              {value === null || value === undefined ? (
                                <span className="text-on-surface-variant italic">null</span>
                              ) : typeof value === 'object' ? (
                                JSON.stringify(value)
                              ) : (
                                String(value)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-outline-variant/20 bg-surface-container/40 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveRowId(null)}
                  className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-on-surface transition-colors min-h-[44px]"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* CLEAR CHAT CONFIRMATION MODAL (Requirement 6)                 */}
      {/* ============================================================ */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { scale: 0.95, opacity: 0 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-sm bg-surface-container-lowest dark:bg-surface-container-high rounded-2xl p-5 shadow-2xl border border-outline-variant/30 flex flex-col gap-4 text-on-surface"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="clear-chat-title"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-error/15 text-error flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px]">delete</span>
                </div>
                <div>
                  <h3 id="clear-chat-title" className="font-bold text-base text-on-surface">
                    Clear conversation?
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    This will remove all messages from the current session.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3.5 py-2 rounded-xl border border-outline-variant/40 hover:bg-surface-container text-xs font-medium text-on-surface transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClear}
                  className="px-4 py-2 rounded-xl bg-error text-on-error font-semibold text-xs hover:opacity-90 transition-opacity min-h-[44px]"
                >
                  Clear chat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
