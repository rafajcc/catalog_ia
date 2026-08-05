import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { downloadBlob, getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { ReviewState } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function ReviewPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const { t } = useI18n();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleLoad() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.getReviewState(dataId);
      setReview(result.data ?? null);
      setMessage({ kind: 'success', text: t('review.loaded') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptAll() {
    setBusy(true);
    setMessage(null);
    try {
      await api.batchReviewAction(dataId, 'accept_all');
      setMessage({ kind: 'success', text: t('review.accepted') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await api.exportReviewState(dataId);
      downloadBlob(blob, `review_${dataId}.json`);
      setMessage({ kind: 'success', text: t('review.exported') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t('review.title')}</h2>
      <p>
        {t('common.dataId', { id: dataId })}
      </p>

      <button type="button" className="btn primary" disabled={busy} onClick={handleLoad}>
        {t('review.loadButton')}
      </button>

      {review && (
        <>
          <div className="chips">
            <span className="chip">{t('review.products', { count: review.total_products })}</span>
            <span className="chip">{t('review.valid', { count: review.valid_count })}</span>
            <span className="chip">{t('review.invalid', { count: review.invalid_count })}</span>
            <span className="chip">{t('review.withSuggestions', { count: review.suggested_count })}</span>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn" disabled={busy} onClick={handleAcceptAll}>
              {t('review.acceptAll')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={handleExport}>
              {t('review.export')}
            </button>
          </div>
        </>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
