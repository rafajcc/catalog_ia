import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { AIContentField, AIProviderName, AIResponse } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

const FIELDS: Array<{ value: AIContentField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'description_short', label: 'Short description' },
  { value: 'description', label: 'Description' },
  { value: 'meta_title', label: 'Meta title' },
  { value: 'meta_description', label: 'Meta description' },
  { value: 'link_rewrite', label: 'Link rewrite' }
];

export default function SuggestionsPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const [provider, setProvider] = useState<AIProviderName>('mock');
  const [language, setLanguage] = useState('es');
  const [enabledFields, setEnabledFields] = useState<AIContentField[]>(['name', 'description']);
  const [suggestions, setSuggestions] = useState<AIResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  function toggleField(field: AIContentField) {
    setEnabledFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function run(action: () => Promise<{ data?: any }>, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data) ? result.data : [];
      setSuggestions(items);
      setMessage({ kind: 'success', text: `${successText} (${items.length} suggestions)` });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>AI suggestions</h2>
      <p>
        Data id: <strong>{dataId}</strong>
      </p>

      <div className="field">
        <label htmlFor="ai-sug-provider">Provider</label>
        <select
          id="ai-sug-provider"
          value={provider}
          disabled={busy}
          onChange={(event) => setProvider(event.target.value as AIProviderName)}
        >
          <option value="mock">Mock</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="ai-sug-language">Language</label>
        <input
          id="ai-sug-language"
          type="text"
          value={language}
          disabled={busy}
          onChange={(event) => setLanguage(event.target.value)}
        />
      </div>

      <div className="field">
        <span>Fields</span>
        {FIELDS.map((field) => (
          <label key={field.value} style={{ display: 'block', marginLeft: '0.25rem' }}>
            <input
              type="checkbox"
              checked={enabledFields.includes(field.value)}
              disabled={busy}
              onChange={() => toggleField(field.value)}
            />
            {field.label}
          </label>
        ))}
      </div>

      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() =>
          run(
            () => api.generateTextSuggestions(dataId, { provider, language, enabled_fields: enabledFields }),
            'Suggestions generated'
          )
        }
      >
        Generate suggestions
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => run(() => api.getTextSuggestions(dataId), 'Suggestions loaded')}
      >
        Load suggestions
      </button>

      {suggestions.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>Field</th>
              <th>Suggested value</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.slice(0, 10).map((suggestion, index) => (
              <tr key={`${suggestion.original_field}-${index}`}>
                <td>{suggestion.original_field}</td>
                <td>{suggestion.suggested_value}</td>
                <td>{(suggestion.confidence * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
