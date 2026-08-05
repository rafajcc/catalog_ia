import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { downloadBlob, getErrorMessage } from '../../utils/download';
import { ReviewState } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function ReviewPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleLoad() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.getReviewState(dataId);
      setReview(result.data ?? null);
      setMessage({ kind: 'success', text: 'Review state loaded' });
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
      setMessage({ kind: 'success', text: 'All changes accepted' });
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
      setMessage({ kind: 'success', text: 'Review state exported' });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Review</h2>
      <p>
        Data id: <strong>{dataId}</strong>
      </p>

      <button type="button" className="btn primary" disabled={busy} onClick={handleLoad}>
        Load review state
      </button>

      {review && (
        <>
          <div className="chips">
            <span className="chip">{review.total_products} products</span>
            <span className="chip">{review.valid_count} valid</span>
            <span className="chip">{review.invalid_count} invalid</span>
            <span className="chip">{review.suggested_count} with suggestions</span>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn" disabled={busy} onClick={handleAcceptAll}>
              Accept all
            </button>
            <button type="button" className="btn" disabled={busy} onClick={handleExport}>
              Export
            </button>
          </div>
        </>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
