import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { ProductData } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

export default function ValidationPanel({ dataId }: { dataId: string }) {
  const api = getApiService();
  const { t } = useI18n();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function run(action: () => Promise<{ data?: any }>, successKey: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data?.products) ? result.data.products : [];
      setProducts(items);
      setMessage({
        kind: 'success',
        text: `${t(successKey)} (${t('validation.countProducts', { count: items.length })})`
      });
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
      <h2>{t('validation.title')}</h2>
      <p>
        {t('common.dataId', { id: dataId })}
      </p>
      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() => run(() => api.validateProducts(dataId), 'validation.finished')}
      >
        {t('validation.validateButton')}
      </button>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => run(() => api.getValidationResults(dataId), 'validation.loaded')}
      >
        {t('validation.loadButton')}
      </button>

      {products.length > 0 && (
        <>
          <div className="chips">
            <span className="chip">{t('validation.total', { count: products.length })}</span>
            <span className="chip">{t('validation.valid', { count: validCount })}</span>
            <span className="chip">{t('validation.withErrors', { count: invalidCount })}</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>{t('validation.name')}</th>
                <th>{t('validation.errors')}</th>
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
