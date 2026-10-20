import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { SampleBanner } from '../components/SampleBanner';
import { InsightAnswerData } from '../types';

interface InsightAgentProps {
  isSample?: boolean;
}

const EXAMPLES = [
  'What should people do in a heatwave according to NDMA?',
  'What does the latest PMD flood bulletin say?',
  'What does WHO say about signs of heat stroke?',
  'How many people died in the Karachi floods?',
];

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = true }) => {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<InsightAnswerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (text: string) => api.askInsight(text),
    onSuccess: (response) => {
      setResult(response.data);
      setError(null);
    },
    onError: (err: Error) => {
      setResult(null);
      setError(err.message || 'The insight request failed.');
    },
  });

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    ask.mutate(trimmed);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      <SampleBanner isSample={isSample} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/30 pb-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
            AI Decision Support &amp; Insight Agent
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Answers use retrieved source notes and numbers copied from gold-table rows. Unsupported questions return “I don’t know”.
          </p>
        </div>
        <span className="font-mono text-[11px] px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold border border-secondary/20">
          ROW IDS REQUIRED
        </span>
      </div>

      <form
        className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor="insight-question" className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
          Question for traffic police or Rescue 1122 dispatch
        </label>
        <textarea
          id="insight-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-outline-variant/40 bg-surface px-3 py-2 text-on-surface font-body-md"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => submit(example)}
              className="px-2.5 py-1 rounded-full border border-outline-variant/40 text-xs text-on-surface-variant hover:bg-surface-container"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={ask.isPending || question.trim() === ''}
          className="self-start px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold text-sm disabled:opacity-60"
        >
          {ask.isPending ? 'Checking sources…' : 'Ask with citations'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error-container/20 px-3 py-2 text-sm text-on-surface" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/30 flex flex-col gap-4">
          <p className={`font-mono text-[11px] uppercase tracking-wider ${result.knows ? 'text-secondary' : 'text-on-surface-variant'}`}>
            {result.knows ? 'Supported answer' : 'Not enough support'}
          </p>
          <p className="text-on-surface font-body-md whitespace-pre-wrap">{result.answer}</p>
          <p className="text-sm text-on-surface-variant">{result.limits}</p>

          <div>
            <h2 className="font-semibold text-sm text-on-surface mb-2">Gold row IDs</h2>
            {result.row_ids.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No gold row was used.</p>
            ) : (
              <ul className="font-mono text-xs text-on-surface flex flex-col gap-1">
                {result.row_ids.map((rowId) => (
                  <li key={rowId}>{rowId}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-sm text-on-surface mb-2">Citations</h2>
            {result.citations.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No advisory section cleared the retrieval threshold.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {result.citations.map((citation) => (
                  <li key={citation.section_id} className="border border-outline-variant/30 rounded-lg p-3">
                    <p className="text-sm font-semibold text-on-surface">{citation.title}</p>
                    <p className="font-mono text-[11px] text-on-surface-variant">{citation.publisher} · {citation.section_id}</p>
                    <p className="text-sm text-on-surface mt-1">{citation.excerpt}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
