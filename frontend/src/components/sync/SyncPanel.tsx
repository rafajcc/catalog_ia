import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { SyncResult, SyncSession } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function SyncPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const { t } = useI18n();
  const [batchSize, setBatchSize] = useState(10);
  const [session, setSession] = useState<SyncSession | null>(null);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const sessionId = session?.id ?? '';

  async function handleCreateSession() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.createSyncSession(dataId, { batch_size: batchSize });
      const created = response.session ?? null;
      setSession(created);
      setResults([]);
      setMessage({ kind: 'success', text: t('sync.sessionCreated', { id: created?.id ?? response.session_id ?? '' }) });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<{ data?: any }>, successKey: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data) ? result.data : [];
      setResults(items);
      setMessage({ kind: 'success', text: t(successKey) });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const completed = results.filter((r) => r.status === 'completed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return (
    <section className="card">
      <h2>{t('sync.title')}</h2>
      <p>
        {t('common.dataId', { id: dataId })}
      </p>

      <div className="field">
        <label htmlFor="sync-batch-size">{t('sync.batchSize')}</label>
        <input
          id="sync-batch-size"
          type="number"
          min="1"
          value={batchSize}
          disabled={busy}
          onChange={(event) => setBatchSize(Math.max(1, Number(event.target.value)))}
        />
      </div>

      <button type="button" className="btn primary" disabled={busy} onClick={handleCreateSession}>
        {t('sync.createSession')}
      </button>

      {session && (
        <>
          <div className="chips">
            <span className="chip">{t('sync.sessionLabel', { id: session.id })}</span>
            <span className="chip">{t('sync.statusLabel', { status: session.status })}</span>
            {session.dry_run && <span className="chip">{t('sync.dryRun')}</span>}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !sessionId}
            onClick={() => run(() => api.startSync(sessionId), 'sync.started')}
          >
            {t('sync.start')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !sessionId}
            onClick={() => run(() => api.getSyncResults(sessionId), 'sync.resultsLoaded')}
          >
            {t('sync.getResults')}
          </button>
        </>
      )}

      {results.length > 0 && (
        <div className="chips">
          <span className="chip">{t('sync.completed', { count: completed })}</span>
          <span className="chip">{t('sync.failed', { count: failed })}</span>
        </div>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
