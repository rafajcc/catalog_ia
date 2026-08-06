import { useEffect, useRef, useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { ProductData, UploadItem } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

interface ValidationPanelProps {
  dataId: string;
  csvFiles?: UploadItem[];
  autoLoad?: boolean;
  onValidated?: () => void;
}

export default function ValidationPanel({ dataId, csvFiles = [], autoLoad = false, onValidated }: ValidationPanelProps) {
  const api = getApiService();
  const { t } = useI18n();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const autoLoadRef = useRef(autoLoad);
  autoLoadRef.current = autoLoad;

  useEffect(() => {
    if (!autoLoadRef.current) return;
    let active = true;
    (async () => {
      try {
        const result = await api.getValidationResults(dataId);
        if (!active) return;
        const items = Array.isArray(result?.data?.products) ? result.data.products : [];
        setProducts(items);
        setMessage({
          kind: 'success',
          text: `${t('validation.loaded')} (${t('validation.countProducts', { count: items.length })})`
        });
      } catch (error) {
        if (!active) return;
        setProducts([]);
        setMessage({ kind: 'error', text: getErrorMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [dataId, api, t]);

  async function run(action: () => Promise<{ data?: any }>, successKey: string, onSuccess?: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const items = Array.isArray(result.data?.products) ? result.data.products : [];
      setProducts(items);
      onSuccess?.();
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
      <button
        type="button"
        className="btn primary"
        disabled={busy}
        onClick={() => run(() => api.validateProducts(dataId), 'validation.finished', onValidated)}
      >
        {t('validation.validateButton')}
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

      {csvFiles.length > 0 && (
        <div className="uploaded-list">
          <div className="uploaded-group">
            <div className="uploaded-group-header">
              <strong>{t('validation.filesTitle', { count: csvFiles.length })}</strong>
              <button
                type="button"
                className="btn btn-small"
                aria-expanded={filesOpen}
                aria-controls="validation-file-list"
                onClick={() => setFilesOpen((value) => !value)}
              >
                {filesOpen ? t('validation.filesHide') : t('validation.filesShow')}
              </button>
            </div>
            {filesOpen && (
              <ul id="validation-file-list">
                {csvFiles.map((file) => (
                  <li key={file.id}>
                    <span>{file.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
