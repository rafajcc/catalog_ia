import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { ProductData } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function ValidationPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function run(action: () => Promise<{ data?: any }>, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data?.products) ? result.data.products : [];
      setProducts(items);
      setMessage({ kind: 'success', text: `${successText} (${items.length} products)` });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const validCount = products.filter((p) => (p.validation_errors ?? []).length === 0).length;
  const invalidCount = products.length - validCount;

  return (
    <section className="card">
      <h2>Validation</h2>
      <p>
        Data id: <strong>{dataId}</strong>
      </p>
      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() => run(() => api.validateProducts(dataId), 'Validation finished')}
      >
        Validate products
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => run(() => api.getValidationResults(dataId), 'Results loaded')}
      >
        Load results
      </button>

      {products.length > 0 && (
        <>
          <div className="chips">
            <span className="chip">{products.length} total</span>
            <span className="chip">{validCount} valid</span>
            <span className="chip">{invalidCount} with errors</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 10).map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{(product.validation_errors ?? []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
