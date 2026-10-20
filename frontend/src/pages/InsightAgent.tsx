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
  AnswerMetric,
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
  metrics?: AnswerMetric[];
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

/**
 * Shorten row IDs for row chip labels:
 * e.g. "predictions|Karachi|heavy_rain|2026-10-20 11:00:00" -> "predictions - Karachi - heavy_rain - 11:00"
 */
function formatRowChipLabel(rowId: string): string {
  if (rowId.includes('|')) {
    const parts = rowId.split('|');
    if (parts.length === 2 && parts[1].includes('T')) {
      const city = parts[0];
      const timePart = parts[1].split('T')[1]?.slice(0, 5) || '';
      return timePart ? `weather_hourly - ${city} - ${timePart}` : `weather_hourly - ${city}`;
    }
    const cleanParts = parts.map((p) => {
      if (p.includes(' ') && p.includes(':')) {
        return p.split(' ')[1].slice(0, 5);
      }
      if (p.includes('T') && p.includes(':')) {
        return p.split('T')[1].slice(0, 5);
      }
      return p;
    });
    return cleanParts.join(' - ');
  }
  return rowId;
}

/**
 * Health or safety query detection for conditional emergency protocol line
 */
function isHealthOrSafety(msg: ChatMessage): boolean {
  const combined = `${msg.text} ${msg.limits || ''} ${msg.retryQuestion || ''}`.toLowerCase();
  const keywords = [
    'heatstroke',
    'heat stroke',
    'exhaustion',
    'dehydration',
    'flood danger',
    'flash flood',
    'injury',
    'casualty',
    'health',
    'medical',
    'illness',
    'symptom',
    'fever',
    'emergency',
    'ambulance',
    'rescue',
    '1122',
    'drowning',
    'hospital',
    'patient',
    'sunstroke',
  ];
  return keywords.some((k) => combined.includes(k));
}

interface ParsedMetricGroup {
  group: string;
  metrics: AnswerMetric[];
}

interface ParsedAnswer {
  summary: string;
  groups: ParsedMetricGroup[];
  guidanceText?: string;
  missingText?: string;
}

/**
 * Render the answer as a short summary sentence plus a small key-value table
 * of numbers (label, value, unit). Formats probabilities as percentages (0.0082 -> 0.8%)
 * with raw value in tooltip, collapsing repeated model labels into header chips.
 */
function parseAnswerContent(text: string, incomingMetrics?: AnswerMetric[]): ParsedAnswer {
  // If structured metrics exist from backend, group them cleanly
  if (incomingMetrics && incomingMetrics.length > 0) {
    const groupMap: Record<string, AnswerMetric[]> = {};
    incomingMetrics.forEach((m) => {
      const g = m.group || 'Warehouse Gold Records';
      if (!groupMap[g]) groupMap[g] = [];
      groupMap[g].push(m);
    });

    let guidanceText: string | undefined;
    let missingText: string | undefined;

    const lines = text.split('\n\n');
    lines.forEach((line) => {
      if (line.toLowerCase().startsWith('guidance from')) {
        guidanceText = line;
      } else if (line.toLowerCase().includes('missing:')) {
        missingText = line.split(/missing:/i)[1]?.trim();
      }
    });

    let summary = 'Verified quantitative records from DuckDB gold tables:';
    if (text.toLowerCase().includes('weather table')) {
      summary = 'Latest observed weather recorded in DuckDB warehouse:';
    } else if (incomingMetrics.some((m) => m.label.toLowerCase().includes('prob'))) {
      summary = 'Predictive hazard model estimates with verified probability bounds:';
    }

    return {
      summary,
      groups: Object.entries(groupMap).map(([group, metrics]) => ({ group, metrics })),
      guidanceText,
      missingText,
    };
  }

  // Fallback: parse numbers and model labels directly from text
  const groups: ParsedMetricGroup[] = [];
  let summary = '';
  let guidanceText: string | undefined;
  let missingText: string | undefined;

  if (text.includes('Missing:')) {
    const parts = text.split(/Missing:/i);
    missingText = parts[1]?.trim();
  }

  if (text.toLowerCase().startsWith('guidance from')) {
    guidanceText = text.split('\n\n')[0] || text;
  }

  // Check for weather pattern
  const weatherMatch = text.match(
    /Latest observed temperature, humidity and rainfall for ([^:]+) from the weather table:\s*([\d\.]+)°C,\s*([\d\.]+)% humidity,\s*and\s*([\d\.]+) mm rainfall/i
  );
  if (weatherMatch) {
    summary = `Latest observed weather for ${weatherMatch[1]} from DuckDB warehouse:`;
    groups.push({
      group: `Observed Weather · ${weatherMatch[1]}`,
      metrics: [
        {
          group: `Observed Weather · ${weatherMatch[1]}`,
          label: 'Temperature',
          raw_value: weatherMatch[2],
          formatted_value: `${weatherMatch[2]}°C`,
          unit: '°C',
        },
        {
          group: `Observed Weather · ${weatherMatch[1]}`,
          label: 'Relative Humidity',
          raw_value: weatherMatch[3],
          formatted_value: `${weatherMatch[3]}%`,
          unit: '%',
        },
        {
          group: `Observed Weather · ${weatherMatch[1]}`,
          label: 'Rainfall',
          raw_value: weatherMatch[4],
          formatted_value: `${weatherMatch[4]} mm`,
          unit: 'mm',
        },
      ],
    });
  } else {
    // Check for Model (zone - hazard): ... patterns
    const modelBlocks = text.split(/;\s*while\s*|;\s*|\.\s*(?=[A-Z])/);
    modelBlocks.forEach((block) => {
      if (
        block.includes(':') &&
        (block.includes('probability') ||
          block.includes('population') ||
          block.includes('vulnerability') ||
          block.includes('score') ||
          block.includes('interval'))
      ) {
        const colonIdx = block.indexOf(':');
        const modelLabel = block
          .substring(0, colonIdx)
          .replace(/Verified records indicate /i, '')
          .replace(/According to verified warehouse records, /i, '')
          .replace(/According to official warehouse records, /i, '')
          .trim();
        const metricsStr = block.substring(colonIdx + 1).trim();
        const metrics: AnswerMetric[] = [];

        const pairs = metricsStr.split(/,\s*|and\s*/);
        pairs.forEach((pair) => {
          const match = pair.match(/([a-zA-Z\s_]+)\s+is\s+([\d\.]+)/i);
          if (match) {
            const rawLabel = match[1].trim();
            const rawVal = match[2];
            const valNum = parseFloat(rawVal);
            let formatted = rawVal;
            let unit = '';

            if (
              rawLabel.toLowerCase().includes('prob') ||
              rawLabel.toLowerCase().includes('interval') ||
              rawLabel.toLowerCase().includes('base')
            ) {
              formatted = `${(valNum * 100).toFixed(1)}%`;
              unit = '%';
            } else if (
              rawLabel.toLowerCase().includes('pop') ||
              rawLabel.toLowerCase().includes('count') ||
              rawLabel.toLowerCase().includes('facilit')
            ) {
              formatted = Math.round(valNum).toLocaleString();
              unit = rawLabel.toLowerCase().includes('pop') ? 'people' : 'count';
            } else if (rawLabel.toLowerCase().includes('score')) {
              unit = 'score (0-1)';
            }

            metrics.push({
              group: modelLabel,
              label: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
              raw_value: rawVal,
              formatted_value: formatted,
              unit,
            });
          }
        });

        if (metrics.length > 0) {
          groups.push({ group: modelLabel, metrics });
        }
      }
    });

    if (groups.length > 0) {
      summary = 'Verified quantitative records from DuckDB gold tables:';
    } else {
      summary = text.split('\n\n')[0] || text;
    }
  }

  return { summary, groups, guidanceText, missingText };
}

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

  // Adjust textarea height up to ~6 lines (max 140px)
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

    // Hide suggestions after sending
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
        metrics: data.metrics || [],
        latencyMs: latency,
        sourcesCount: data.citations?.length || 0,
        rowsCount: data.row_ids?.length || 0,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
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

  // Copy Answer with citations and data
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
  const renderInlineCitations = (textStr: string, msg: ChatMessage) => {
    const parts = textStr.split(/(\[\d+\])/g);
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
                title={
                  citItem
                    ? `Source [${citNumber}]: ${citItem.document} - ${citItem.section}`
                    : `Source [${citNumber}]`
                }
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

  return (
    /* 1. One shared content container for the whole page: max-width about 880px, centered, same horizontal padding */
    <div className="w-full flex-1 flex flex-col items-center">
      <div className="w-full max-w-[880px] px-4 sm:px-6 flex-1 flex flex-col justify-between">
        <SampleBanner isSample={isSample} />

        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/30 pt-4 sm:pt-6 pb-4 mb-3 w-full">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[24px]">auto_awesome</span>
              <h1 className="font-headline-lg text-lg sm:text-xl font-bold text-on-surface tracking-tight">
                AI Climate Assistant
              </h1>
            </div>
            <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
              Strictly grounded in verified guidelines &amp; DuckDB warehouse gold tables. Numbers are exact and citations link to official source manifests.
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

        {/* Message Thread (16px vertical gap between messages) */}
        <div className="flex-1 flex flex-col space-y-4 py-3 w-full">
          {messages.length === 0 && (
            <div className="py-10 sm:py-16 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-secondary/15 text-secondary flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-[28px]">chat_bubble_outline</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-on-surface">
                How can I assist your climate decision support today?
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-md">
                Ask about extreme heat thresholds, heavy rain forecast probabilities, or emergency contingency advisories for Karachi.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              /* 2. User messages: right-aligned with max-width 75% + user meta directly under user bubble, right-aligned */
              if (msg.sender === 'user') {
                return (
                  <motion.div
                    key={msg.id}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-start justify-end gap-2.5 self-end max-w-[85%] sm:max-w-[75%] w-full"
                  >
                    <div className="flex flex-col items-end w-full">
                      <div className="bg-primary text-on-primary rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-xs font-body-md text-sm sm:text-base leading-relaxed break-words max-w-full">
                        {msg.text}
                      </div>

                      {/* 3. User meta (zone chip, time) directly under user bubble, right-aligned */}
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-on-surface-variant font-mono justify-end">
                        {msg.zone_name && (
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/30 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[11px] text-secondary">location_on</span>
                            {msg.zone_name}
                          </span>
                        )}
                        <span>
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Small avatar or label column so alignment is obvious */}
                    <div
                      className="w-7 h-7 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 select-none"
                      title="You"
                      aria-label="User avatar"
                    >
                      U
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
                    className="flex items-start gap-2.5 self-start w-full"
                  >
                    <div className="w-7 h-7 rounded-xl bg-error/15 text-error border border-error/30 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                      <span className="material-symbols-outlined text-[16px]">error</span>
                    </div>
                    <div
                      className="flex-1 w-full rounded-2xl rounded-tl-xs border border-error/40 bg-error-container/20 p-4 text-on-surface shadow-xs flex flex-col gap-3"
                      role="alert"
                    >
                      <div className="flex items-center gap-2 text-error font-semibold text-xs sm:text-sm">
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

              /* 2. Assistant messages: left-aligned and take the full container width (up to 100%) */
              const parsedAnswer = parseAnswerContent(msg.text, msg.metrics);

              return (
                <motion.div
                  key={msg.id}
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2.5 self-start w-full"
                >
                  {/* Small assistant avatar column on left */}
                  <div
                    className="w-7 h-7 rounded-xl bg-secondary/15 text-secondary border border-secondary/30 flex items-center justify-center shrink-0 mt-1 shadow-2xs select-none"
                    title="Evidence-based Assistant"
                    aria-label="Assistant avatar"
                  >
                    <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                  </div>

                  {/* Assistant Card taking the full container width (100%) */}
                  <div className="flex-1 w-full rounded-2xl rounded-tl-xs border border-outline-variant/30 bg-surface-container-lowest dark:bg-surface-container p-4 sm:p-5 shadow-xs flex flex-col gap-3.5 text-on-surface">
                    {/* 10. Card Header: Renamed to "Evidence-based answer". Never describe output as official */}
                    <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-secondary/15 flex items-center justify-center text-secondary">
                          <span className="material-symbols-outlined text-[14px]">verified</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-secondary uppercase tracking-wider">
                          Evidence-based answer
                        </span>
                        {msg.supported === false && (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                            Strict Guardrail
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-on-surface-variant">
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

                    {/* 8 & 9. ANSWER PRESENTATION: Short summary sentence + small key-value table of numbers */}
                    <div className="flex flex-col gap-3 font-body-md text-sm text-on-surface leading-relaxed">
                      {/* Short summary sentence */}
                      <p className="font-medium text-on-surface">
                        {renderInlineCitations(parsedAnswer.summary, msg)}
                      </p>

                      {/* Guidance text if present (e.g. from official WHO/NDMA guidelines) */}
                      {parsedAnswer.guidanceText && (
                        <div className="p-3 rounded-xl bg-surface-container/50 dark:bg-surface-container-high/40 border border-outline-variant/30 text-xs sm:text-sm text-on-surface leading-relaxed">
                          {renderInlineCitations(parsedAnswer.guidanceText, msg)}
                        </div>
                      )}

                      {/* Key-Value Tables grouped by collapsed model label */}
                      {parsedAnswer.groups.map((grp, gIdx) => (
                        <div key={gIdx} className="flex flex-col gap-1.5 pt-1">
                          {/* 9. Header chip for collapsed model label */}
                          <div className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/10 text-secondary border border-secondary/25 text-xs font-mono font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                            <span>{grp.group}</span>
                          </div>

                          {/* Small key-value table of the numbers (label, value, unit) */}
                          <div className="border border-outline-variant/30 rounded-xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-surface-container dark:bg-surface-container-high border-b border-outline-variant/30 font-mono text-[11px] text-on-surface-variant uppercase">
                                  <th className="py-2 px-3 font-semibold">Parameter</th>
                                  <th className="py-2 px-3 font-semibold">Value</th>
                                  <th className="py-2 px-3 font-semibold text-right">Unit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/20 font-mono bg-surface dark:bg-surface-container-lowest">
                                {grp.metrics.map((m, mIdx) => (
                                  <tr key={mIdx} className="hover:bg-surface-container/40 transition-colors">
                                    <td className="py-2 px-3 font-medium text-on-surface-variant">{m.label}</td>
                                    <td className="py-2 px-3 font-bold text-on-surface">
                                      <span
                                        title={`Raw database value: ${m.raw_value}`}
                                        className="cursor-help underline decoration-dotted decoration-outline-variant hover:text-secondary transition-colors"
                                      >
                                        {m.formatted_value}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right text-on-surface-variant text-[11px]">
                                      {m.unit || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}

                      {/* Missing explanation for unsupported queries */}
                      {parsedAnswer.missingText && (
                        <div className="bg-surface-container/60 dark:bg-surface-container-high/60 rounded-xl p-3 border border-outline-variant/20 text-xs">
                          <span className="font-semibold text-on-surface block mb-0.5">Missing:</span>
                          <span className="text-on-surface-variant">{parsedAnswer.missingText}</span>
                        </div>
                      )}

                      {/* Try Asking Examples for unsupported questions */}
                      {msg.supported === false && (
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
                      )}
                    </div>

                    {/* 4. SOURCES: Responsive grid (1 col mobile, 2 col desktop) of equal-height cards */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/20">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                          <span className="material-symbols-outlined text-[15px] text-secondary">
                            library_books
                          </span>
                          <span>Sources &amp; Citations:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                          {msg.citations.map((cit, idx) => {
                            const key = `${msg.id}-${idx}`;
                            const isHovered = hoveredCitationKey === key;
                            const docName = cit.document
                              .replace(/\.(pdf|txt)$/i, '')
                              .replace(/_/g, ' ');

                            return (
                              <button
                                key={idx}
                                id={`citation-${msg.id}-${idx}`}
                                type="button"
                                onClick={() => setActiveCitation(cit)}
                                onMouseEnter={() => setHoveredCitationKey(key)}
                                onMouseLeave={() => setHoveredCitationKey(null)}
                                title={`${cit.document}\nSection: ${cit.section}`}
                                className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border text-left transition-all h-full min-h-[58px] overflow-hidden ${
                                  isHovered
                                    ? 'bg-secondary/15 border-secondary text-on-surface ring-2 ring-secondary/30'
                                    : 'bg-surface dark:bg-surface-container-high border-outline-variant/40 text-on-surface hover:bg-surface-container'
                                }`}
                                aria-label={`View citation [${idx + 1}] ${cit.document}`}
                              >
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  <span className="font-mono font-bold text-secondary text-xs shrink-0 mt-0.5">
                                    [{idx + 1}]
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className="text-xs font-semibold text-on-surface line-clamp-2 leading-tight break-words"
                                      title={cit.document}
                                    >
                                      {docName}
                                    </div>
                                    <div
                                      className="text-[11px] text-on-surface-variant truncate mt-0.5"
                                      title={cit.section}
                                    >
                                      {cit.section}
                                    </div>
                                  </div>
                                </div>
                                <span className="material-symbols-outlined text-[15px] text-on-surface-variant shrink-0 mt-0.5">
                                  open_in_new
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 5. DATA USED: Wrap row chips in a flex row with wrapping. Short labels + full ID in tooltip & popover */}
                    {msg.row_ids && msg.row_ids.length > 0 && (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                          <span className="material-symbols-outlined text-[15px] text-secondary">
                            table_view
                          </span>
                          <span>Data used (DuckDB gold rows):</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.row_ids.map((rowId, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setActiveRowId(rowId)}
                              title={`Full Row ID: ${rowId} (Click to inspect table row in popover)`}
                              className="font-mono text-[11px] px-2.5 py-1.5 rounded-lg bg-surface dark:bg-surface-container-high border border-outline-variant/40 hover:border-secondary hover:text-secondary text-on-surface transition-colors flex items-center gap-1.5 min-h-[36px] max-w-full"
                              aria-label={`Inspect row ${rowId}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                              <span className="truncate">{formatRowChipLabel(rowId)}</span>
                              <span className="material-symbols-outlined text-[13px] text-on-surface-variant shrink-0">
                                info
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 6 & 11. LIMITS & EMERGENCY BLOCK: Subtle background, consistent padding. Emergency line ONLY when health/safety related */}
                    <div className="bg-surface-container/40 dark:bg-surface-container-high/30 rounded-xl p-3 border border-outline-variant/20 flex flex-col gap-1.5 text-xs">
                      <div className="text-on-surface-variant flex items-start gap-1.5 leading-relaxed">
                        <span className="material-symbols-outlined text-[15px] text-on-surface-variant shrink-0 mt-0.5">
                          info
                        </span>
                        <span>{msg.limits || 'Information only, not professional advice.'}</span>
                      </div>

                      {isHealthOrSafety(msg) && (
                        <div className="flex items-start gap-2 pt-2 border-t border-outline-variant/20 text-on-surface leading-snug">
                          <span className="material-symbols-outlined text-[16px] text-error shrink-0 mt-0.5">
                            emergency
                          </span>
                          <span>
                            <strong className="text-error">Emergency protocol:</strong> In case of heat stroke, acute distress, or flood danger, immediately contact <strong>Rescue 1122</strong> or <strong>Sindh PDMA (1736)</strong>.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 3. ASSISTANT META: One muted line at the bottom of the card, left-aligned */}
                    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/80 font-mono pt-2 border-t border-outline-variant/20">
                      <span>⚡ {msg.latencyMs || 0}ms</span>
                      <span>·</span>
                      <span>{msg.sourcesCount ?? msg.citations?.length ?? 0} sources</span>
                      <span>·</span>
                      <span>{msg.rowsCount ?? msg.row_ids?.length ?? 0} gold rows</span>
                      <span>·</span>
                      <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Thinking State Bubble */}
          {isLoading && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              className="flex items-start gap-2.5 self-start w-full"
            >
              <div className="w-7 h-7 rounded-xl bg-secondary/15 text-secondary border border-secondary/30 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              </div>
              <div className="rounded-2xl rounded-tl-xs border border-outline-variant/30 bg-surface-container-lowest dark:bg-surface-container p-4 shadow-xs flex items-center justify-between gap-4 w-full flex-1">
                <div className="flex items-center gap-3">
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

        {/* Suggestion Chips */}
        {showSuggestions && (
          <div className="pb-3 flex flex-wrap items-center gap-2 w-full">
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

        {/* 7. FIXED / STICKY BOTTOM INPUT BAR (without overlapping mobile nav or footer) */}
        <div className="sticky bottom-14 sm:bottom-0 z-30 pt-2 pb-3 bg-background/95 backdrop-blur-md border-t border-outline-variant/30 w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex items-end gap-2 bg-surface-container-lowest dark:bg-surface-container rounded-2xl p-2 sm:p-2.5 border border-outline-variant/40 shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-all w-full"
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

            {/* Send Button / Loading Spinner */}
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
      </div>

      {/* Citation slide-over panel / bottom sheet */}
      <AnimatePresence>
        {activeCitation && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveCitation(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            />

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

      {/* Gold Row popover modal */}
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
              animate={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 w-full max-w-xl bg-surface-container-lowest dark:bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[85vh] overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Gold Row Record Details"
            >
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

      {/* Clear chat confirmation modal */}
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
              animate={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
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
