import React, { useEffect, useRef, useState } from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { api, ApiError } from '../api/client';
import { InsightAnswer, InsightCitation, InsightDataRow, InsightFact } from '../types';

interface InsightAgentProps {
  isSample?: boolean;
}

interface ChatTurn {
  id: number;
  question: string;
  askedAt: Date;
  latencyMs?: number;
  answer?: InsightAnswer;
  error?: string;
}

const SUGGESTED = [
  'What is the latest observed temperature in Karachi?',
  "What's the weather today in Karachi?",
  'What is the next-hour rainfall forecast for Karachi?',
  'Heat stroke risk with current Karachi temperature?',
  'When was the last successful hourly ingest?',
  'How does the rainfall model compare with its baseline?',
];

function formatPktClock(date: Date): string {
  return date.toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortRowLabel(label: string): string {
  const cleaned = label.replace(/\s+/g, ' ').trim();
  const pktMatch = cleaned.match(/(\d{2}:\d{2})\s*PKT/i);
  if (pktMatch) {
    const withoutTime = cleaned
      .replace(/\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}\s*PKT/i, pktMatch[1])
      .replace(/\s+/g, ' ')
      .trim();
    return withoutTime.length > 64 ? `${withoutTime.slice(0, 61)}…` : withoutTime;
  }
  return cleaned.length > 64 ? `${cleaned.slice(0, 61)}…` : cleaned;
}

function formatFactValue(fact: InsightFact): { display: string; raw: string } {
  const raw = fact.value;
  if (fact.unit === 'probability') {
    const numeric = Number(fact.value);
    if (!Number.isNaN(numeric)) {
      const pct = (numeric * 100).toFixed(1);
      return { display: `${pct}%`, raw };
    }
  }
  return { display: fact.value, raw };
}

function summarySentence(answer: string): string {
  const trimmed = answer.trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : trimmed;
}

function isSafetyRelated(turn: ChatTurn): boolean {
  if (turn.answer?.safety_related) return true;
  const text = `${turn.question} ${turn.answer?.answer || ''}`.toLowerCase();
  return (
    text.includes('heat stroke') ||
    text.includes('heatstroke') ||
    text.includes('flood danger') ||
    text.includes('injury') ||
    text.includes('injured')
  );
}

const DataRowChip: React.FC<{ row: InsightDataRow }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        title={row.row_id}
        onClick={() => setOpen((value) => !value)}
        className="max-w-full truncate rounded-full border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-[11px] font-mono text-on-surface-variant hover:bg-surface-container-high"
      >
        {shortRowLabel(row.label)}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 max-w-[80vw] rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-[11px] shadow-lg">
          <p className="font-semibold text-on-surface mb-1">{shortRowLabel(row.label)}</p>
          <p className="font-mono break-all text-on-surface-variant" title={row.row_id}>
            {row.row_id}
          </p>
          <button
            type="button"
            className="mt-2 text-[10px] uppercase tracking-wide text-secondary"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

const SourceCard: React.FC<{ citation: InsightCitation; index: number }> = ({ citation, index }) => {
  const title = citation.title || citation.source;
  const section = citation.section || citation.detail;
  return (
    <div className="h-full min-w-0 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 flex gap-2">
      <span className="shrink-0 font-mono text-[11px] font-bold text-secondary">[{index}]</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-on-surface line-clamp-2" title={title}>
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-on-surface-variant line-clamp-2" title={section}>
          {section}
        </p>
      </div>
      <span
        className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0 self-start"
        aria-hidden="true"
        title="Catalog source"
      >
        open_in_new
      </span>
    </div>
  );
};

const AnswerCard: React.FC<{ turn: ChatTurn }> = ({ turn }) => {
  const answer = turn.answer;
  if (!answer) {
    return (
      <div className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
        Checking the warehouse…
      </div>
    );
  }

  const facts = answer.facts || [];
  const dataRows = answer.data_rows || [];
  const citations = answer.citations || [];
  const docCitations = citations.filter((item) => item.source === 'document_catalog' && item.title);
  const otherCitations = citations.filter((item) => !(item.source === 'document_catalog' && item.title));
  const sourceCards = docCitations.length > 0 ? docCitations : otherCitations;
  const summary = summarySentence(answer.answer);
  const showSafety = isSafetyRelated(turn);

  return (
    <div className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
          Evidence-based answer
        </span>
        <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
          {answer.status}
        </span>
        {answer.supported === false && (
          <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            observed data
          </span>
        )}
      </div>

      <div className="px-4 pb-3 space-y-3">
        {answer.model_label && (
          <span className="inline-flex max-w-full truncate rounded-full border border-secondary/30 bg-secondary/10 px-2.5 py-1 text-[11px] font-mono text-secondary">
            {answer.model_label}
          </span>
        )}

        <p className="text-sm leading-relaxed text-on-surface">{summary}</p>

        {facts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/25">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => {
                  const formatted = formatFactValue(fact);
                  return (
                    <tr key={`${fact.label}-${fact.value}`} className="border-t border-outline-variant/20">
                      <td className="px-3 py-2 text-on-surface">{fact.label}</td>
                      <td className="px-3 py-2 font-mono text-on-surface" title={formatted.raw}>
                        {formatted.display}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">
                        {fact.unit === 'probability' ? '%' : fact.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {facts.length === 0 && answer.answer !== summary && (
          <p className="text-sm leading-relaxed text-on-surface-variant">{answer.answer}</p>
        )}

        {sourceCards.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant mb-2">Sources</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sourceCards.map((citation, index) => (
                <SourceCard
                  key={`${citation.source}-${citation.title || citation.detail}-${index}`}
                  citation={citation}
                  index={index + 1}
                />
              ))}
            </div>
          </div>
        )}

        {dataRows.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant mb-2">Data used</p>
            <div className="flex flex-wrap gap-2">
              {dataRows.map((row) => (
                <DataRowChip key={row.row_id} row={row} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-4 rounded-xl bg-surface-container/80 dark:bg-surface-container/40 px-3 py-3 space-y-2">
        <p className="text-[11px] text-on-surface-variant">
          {showSafety
            ? answer.limitations ||
              'In an emergency contact Sindh PDMA on 1736 and Rescue 1122.'
            : 'Information only. This is not professional or emergency advice.'}
        </p>
        {showSafety && answer.limitations && !answer.limitations.toLowerCase().includes('1736') && (
          <p className="text-[11px] text-on-surface-variant">
            In an emergency contact Sindh PDMA on 1736 and Rescue 1122.
          </p>
        )}
      </div>

      <div className="px-4 pb-3 text-[10px] font-mono text-on-surface-variant">
        {[
          turn.latencyMs != null ? `${turn.latencyMs} ms` : null,
          `${citations.length} source${citations.length === 1 ? '' : 's'}`,
          `${dataRows.length} row${dataRows.length === 1 ? '' : 's'}`,
          formatPktClock(new Date()),
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  );
};

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = false }) => {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, pending]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const id = Date.now();
    const started = performance.now();
    setTurns((current) => [...current, { id, question: trimmed, askedAt: new Date() }]);
    setQuestion('');
    setPending(true);
    try {
      const response = await api.askInsight(trimmed);
      const latencyMs = Math.round(performance.now() - started);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, answer: response.data, latencyMs } : turn
        )
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.detail || err.message : 'The assistant request failed.';
      const latencyMs = Math.round(performance.now() - started);
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, error: message, latencyMs } : turn))
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col">
      <div className="w-full max-w-[880px] mx-auto px-4 sm:px-5 flex-1 min-h-0 flex flex-col gap-4 py-4 sm:py-5">
        <SampleBanner isSample={isSample} />

        <header className="shrink-0 border-b border-outline-variant/30 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
                AI Climate Assistant
              </h1>
              <p className="text-sm text-on-surface-variant mt-1">
                Answers come from hourly weather, the rainfall model, pipeline runs, model evaluation, and the document catalog. Official PDFs are catalogued and not parsed.
              </p>
            </div>
            <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold border border-secondary/20 shrink-0 self-start sm:self-auto">
              WAREHOUSE ONLY
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                disabled={pending}
                className="text-left text-xs px-3 py-2 rounded-full bg-surface-container text-on-surface border border-outline-variant/40 hover:bg-surface-container-high disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </header>

        <div
          ref={threadRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5"
          aria-live="polite"
        >
          <div className="flex flex-col gap-4 pb-2">
            {turns.length === 0 && (
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 text-sm text-on-surface-variant">
                Ask about an observed temperature, today&apos;s weather, the 1-hour rainfall model, heat-health guidance, pipeline status, or model scores. Questions outside those sources are refused instead of estimated.
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-4">
                {/* User message */}
                <div className="flex justify-end gap-2">
                  <div className="max-w-[75%] min-w-0 flex flex-col items-end gap-1">
                    <div className="rounded-2xl rounded-br-md bg-primary-container text-on-primary px-4 py-3 text-sm">
                      {turn.question}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant">
                      {turn.answer?.zone && (
                        <span className="rounded-full border border-outline-variant/40 px-2 py-0.5">
                          {turn.answer.zone}
                        </span>
                      )}
                      <span>{formatPktClock(turn.askedAt)}</span>
                    </div>
                  </div>
                  <div
                    className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-[11px] font-bold shrink-0"
                    aria-hidden="true"
                  >
                    You
                  </div>
                </div>

                {/* Assistant message */}
                <div className="flex justify-start gap-2">
                  <div
                    className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined text-[18px]">psychology</span>
                  </div>
                  <div className="min-w-0 flex-1 max-w-full">
                    {turn.error ? (
                      <div className="w-full rounded-2xl border border-error/30 bg-error-container/20 px-4 py-3 text-sm text-error">
                        {turn.error}
                      </div>
                    ) : (
                      <AnswerCard turn={turn} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            {pending && turns.every((turn) => turn.answer || turn.error) && (
              <div className="flex justify-start gap-2">
                <div className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">psychology</span>
                </div>
                <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
                  Checking the warehouse…
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          className="shrink-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-3 border-t border-outline-variant/30 bg-background"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <div className="flex items-end gap-2">
            <label className="flex-1 flex flex-col gap-1 min-w-0">
              <span className="sr-only">Question</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ask about observed weather, the rainfall model, or pipeline status"
                className="w-full resize-none rounded-2xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </label>
            <button
              type="submit"
              disabled={pending || question.trim().length === 0}
              className="min-h-[44px] min-w-[72px] px-4 rounded-2xl bg-secondary text-on-secondary text-sm font-semibold disabled:opacity-50 shrink-0"
            >
              {pending ? 'Asking…' : 'Ask'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
