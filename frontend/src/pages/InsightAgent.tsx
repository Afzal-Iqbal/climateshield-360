import React, { useState } from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { api, ApiError } from '../api/client';
import { InsightAnswer } from '../types';

interface InsightAgentProps {
  isSample?: boolean;
}

interface ChatTurn {
  id: number;
  question: string;
  answer?: InsightAnswer;
  error?: string;
}

const SUGGESTED = [
  'What is the latest observed temperature in Karachi?',
  'What is the next-hour rainfall forecast for Karachi?',
  'When was the last successful hourly ingest?',
  'How does the rainfall model compare with its baseline?',
  'Which impact areas can be forecast?',
  'What do the NDMA documents say about losses?',
];

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = true }) => {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const id = Date.now();
    setTurns((current) => [...current, { id, question: trimmed }]);
    setQuestion('');
    setPending(true);
    try {
      const response = await api.askInsight(trimmed);
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, answer: response.data } : turn))
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.detail || err.message : 'The assistant request failed.';
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, error: message } : turn))
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            AI Decision Support &amp; Insight Agent
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 max-w-3xl">
            Answers come from hourly weather, the rainfall model, pipeline runs, model evaluation, and the document catalog. Official PDFs are catalogued and not parsed, so figures from those files are not quoted.
          </p>
        </div>
        <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold border border-secondary/20 shrink-0">
          WAREHOUSE ONLY
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="flex flex-col gap-4 min-h-[240px]">
        {turns.length === 0 && (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 text-sm text-on-surface-variant">
            Ask about an observed temperature, the 1-hour rainfall model, the last hourly ingest, model scores, forecast coverage, or the document catalog. Questions outside those sources are refused instead of estimated.
          </div>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-2">
            <div className="self-end max-w-3xl rounded-2xl bg-primary-container text-on-primary px-4 py-3 text-sm">
              {turn.question}
            </div>
            <div className="max-w-3xl rounded-2xl bg-surface-container-lowest border border-outline-variant/30 px-4 py-3 text-sm text-on-surface">
              {!turn.answer && !turn.error && <span className="text-on-surface-variant">Checking the warehouse…</span>}
              {turn.error && <p className="text-error">{turn.error}</p>}
              {turn.answer && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
                      {turn.answer.status}
                    </span>
                  </div>
                  <p className="leading-relaxed">{turn.answer.answer}</p>
                  {turn.answer.citations.length > 0 && (
                    <ul className="flex flex-col gap-1 text-xs text-on-surface-variant">
                      {turn.answer.citations.map((citation) => (
                        <li key={`${citation.source}-${citation.detail}`}>
                          <span className="font-mono font-semibold text-on-surface">{citation.source}</span>
                          {' · '}
                          {citation.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  {turn.answer.limitations && (
                    <p className="text-xs text-on-surface-variant border-t border-outline-variant/30 pt-2">
                      {turn.answer.limitations}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex items-end gap-2 sticky bottom-16 sm:bottom-4"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <label className="flex-1 flex flex-col gap-1">
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
          className="min-h-[44px] px-4 rounded-2xl bg-secondary text-on-secondary text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Asking…' : 'Ask'}
        </button>
      </form>
    </div>
  );
};
