import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { ImageMatchResult, ImageMatchStrategy } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

const STRATEGIES: Array<{ value: ImageMatchStrategy; label: string }> = [
  { value: 'ean', label: 'EAN' },
  { value: 'reference', label: 'Reference' },
  { value: 'filename_pattern', label: 'Filename pattern' },
  { value: 'manual', label: 'Manual' }
];

export default function ImageMatchingPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const [strategy, setStrategy] = useState<ImageMatchStrategy>('ean');
  const [threshold, setThreshold] = useState(0.7);
  const [results, setResults] = useState<ImageMatchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function run(action: () => Promise<{ data?: any }>, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data) ? result.data : [];
      setResults(items);
      setMessage({ kind: 'success', text: `${successText} (${items.length} matches)` });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Image matching</h2>
      <p>
        Data id: <strong>{dataId}</strong>
      </p>

      <div className="field">
        <label htmlFor="im-strategy">Strategy</label>
        <select
          id="im-strategy"
          value={strategy}
          disabled={busy}
          onChange={(event) => setStrategy(event.target.value as ImageMatchStrategy)}
        >
          {STRATEGIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="im-threshold">Minimum threshold</label>
        <input
          id="im-threshold"
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={threshold}
          disabled={busy}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
      </div>

      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() =>
          run(
            () => api.matchImages(dataId, { strategy, threshold, max_images_per_product: 5 }),
            'Matching finished'
          )
        }
      >
        Match images
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => run(() => api.getImageMatchingResults(dataId), 'Results loaded')}
      >
        Load results
      </button>

      {results.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th>Product</th>
              <th>Images</th>
              <th>Score</th>
              <th>Strategy</th>
            </tr>
          </thead>
          <tbody>
            {results.slice(0, 10).map((match) => (
              <tr key={match.product_id}>
                <td>{match.product_id}</td>
                <td>{match.matched_files.length}</td>
                <td>{match.match_score.toFixed(2)}</td>
                <td>{match.match_strategy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
