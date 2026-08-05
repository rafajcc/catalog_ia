import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { SyncResult, SyncSession } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function SyncPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
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
      setMessage({ kind: 'success', text: `Session ${created?.id ?? response.session_id ?? ''} created` });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<{ data?: any }>, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data) ? result.data : [];
      setResults(items);
      setMessage({ kind: 'success', text: successText });
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
      <h2>Synchronization</h2>
      <p>
        Data id: <strong>{dataId}</strong>
      </p>

      <div className="field">
        <label htmlFor="sync-batch-size">Batch size</label>
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
        Create session
      </button>

      {session && (
        <>
          <div className="chips">
            <span className="chip">Session: {session.id}</span>
            <span className="chip">Status: {session.status}</span>
            {session.dry_run && <span className="chip">Dry run</span>}
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !sessionId}
            onClick={() => run(() => api.startSync(sessionId), 'Sync started')}
          >
            Start sync
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !sessionId}
            onClick={() => run(() => api.getSyncResults(sessionId), 'Results loaded')}
          >
            Get results
          </button>
        </>
      )}

      {results.length > 0 && (
        <div className="chips">
          <span className="chip">{completed} completed</span>
          <span className="chip">{failed} failed</span>
        </div>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
