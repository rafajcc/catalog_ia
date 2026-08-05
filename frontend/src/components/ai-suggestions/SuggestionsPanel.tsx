import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { AIContentField, AIProviderName, AIResponse } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

const FIELDS: Array<{ value: AIContentField; key: string }> = [
  { value: 'name', key: 'ai.fieldName' },
  { value: 'description_short', key: 'ai.fieldShortDescription' },
  { value: 'description', key: 'ai.fieldDescription' },
  { value: 'meta_title', key: 'ai.fieldMetaTitle' },
  { value: 'meta_description', key: 'ai.fieldMetaDescription' },
  { value: 'link_rewrite', key: 'ai.fieldLinkRewrite' }
];

export default function SuggestionsPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const { t } = useI18n();
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

  async function run(action: () => Promise<{ data?: any }>, successKey: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data) ? result.data : [];
      setSuggestions(items);
      setMessage({ kind: 'success', text: `${t(successKey)} (${t('ai.suggestions', { count: items.length })})` });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('ai.title')}</h2>
      <p>
        {t('common.dataId', { id: dataId })}
      </p>

      <div className="field">
        <label htmlFor="ai-sug-provider">{t('ai.provider')}</label>
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
        <label htmlFor="ai-sug-language">{t('ai.language')}</label>
        <input
          id="ai-sug-language"
          type="text"
          value={language}
          disabled={busy}
          onChange={(event) => setLanguage(event.target.value)}
        />
      </div>

      <div className="field">
        <span>{t('ai.fields')}</span>
        {FIELDS.map((field) => (
          <label key={field.value} style={{ display: 'block', marginLeft: '0.25rem' }}>
            <input
              type="checkbox"
              checked={enabledFields.includes(field.value)}
              disabled={busy}
              onChange={() => toggleField(field.value)}
            />
            {t(field.key)}
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
            'ai.generated'
          )
        }
      >
        {t('ai.generateButton')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => run(() => api.getTextSuggestions(dataId), 'ai.loaded')}
      >
        {t('ai.loadButton')}
      </button>

      {suggestions.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>{t('ai.field')}</th>
              <th>{t('ai.suggestedValue')}</th>
              <th>{t('ai.confidence')}</th>
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
