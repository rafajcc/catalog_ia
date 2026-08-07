import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { ConsistencyResult, ProductData, RowResolution, UploadChangesResult, UploadItem } from '../../types';

const PRODUCT_LEVEL_FIELDS = ['name', 'description', 'description_short', 'brand', 'category', 'tax'] as const;
const NUMERIC_FIELDS = new Set(['price', 'wholesale_price', 'quantity']);

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

function normalizeValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  return String(value ?? '').trim();
}

function applyEdits(row: ProductData, edits: Record<string, string> | undefined): ProductData {
  if (!edits) return row;
  const updated: ProductData = { ...row };
  const target = updated as unknown as Record<string, unknown>;
  for (const [field, raw] of Object.entries(edits)) {
    if (NUMERIC_FIELDS.has(field)) {
      const trimmed = raw.trim();
      if (trimmed === '') {
        target[field] = undefined;
      } else {
        const n = Number(trimmed);
        target[field] = Number.isNaN(n) ? undefined : n;
      }
    } else {
      target[field] = raw;
    }
  }
  return updated;
}

export function computeProductLevelConflicts(rows: ProductData[], resolutions: RowResolution[]): Set<string> {
  const idProductByRow = new Map<string, string>();
  for (const resolution of resolutions) {
    if (resolution.id_product) idProductByRow.set(resolution.row_id, resolution.id_product);
  }

  const groups = new Map<string, ProductData[]>();
  for (const row of rows) {
    const idProduct = idProductByRow.get(row.id);
    if (!idProduct) continue;
    const list = groups.get(idProduct) ?? [];
    list.push(row);
    groups.set(idProduct, list);
  }

  const conflicts = new Set<string>();
  for (const group of groups.values()) {
    for (const field of PRODUCT_LEVEL_FIELDS) {
      const filled = new Set(
        group.map((row) => normalizeValue(row[field as keyof ProductData])).filter((value) => value !== '')
      );
      if (filled.size <= 1) continue;
      for (const row of group) {
        if (normalizeValue(row[field as keyof ProductData]) !== '') {
          conflicts.add(`${row.id}:${field}`);
        }
      }
    }
  }
  return conflicts;
}

export default function ValidationPanel({ dataId, csvFiles = [], autoLoad = false, onValidated }: ValidationPanelProps) {
  const api = getApiService();
  const { t } = useI18n();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [consistency, setConsistency] = useState<ConsistencyResult | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadChangesResult | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
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
        setConsistency(result?.data?.consistency ?? null);
        setEdits({});
        setUploadSummary(null);
        setMessage({
          kind: 'success',
          text: `${t('validation.loaded')} (${t('validation.countProducts', { count: items.length })})`
        });
      } catch (error) {
        if (!active) return;
        setProducts([]);
        setConsistency(null);
        setMessage({ kind: 'error', text: getErrorMessage(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [dataId, api, t]);

  async function runValidate() {
    setBusy(true);
    setMessage(null);
    setUploadSummary(null);
    try {
      const result = await api.validateProducts(dataId);
      const items = Array.isArray(result.data?.products) ? result.data.products : [];
      setProducts(items);
      setConsistency(result.data?.consistency ?? null);
      setEdits({});
      onValidated?.();
      setMessage({
        kind: 'success',
        text: `${t('validation.finished')} (${t('validation.countProducts', { count: items.length })})`
      });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function runUpload() {
    setBusy(true);
    setMessage(null);
    try {
      const rows = products.map((row) => applyEdits(row, edits[row.id]));
      const result = await api.uploadValidatedRows(dataId, rows);
      setUploadSummary(result.data ?? null);
      setMessage({ kind: 'success', text: t('validation.uploaded') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(rowId: string, field: string, value: string) {
    setEdits((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }));
  }

  const effectiveRows = useMemo(() => products.map((row) => applyEdits(row, edits[row.id])), [products, edits]);
  const conflicts = useMemo(
    () => computeProductLevelConflicts(effectiveRows, consistency?.resolutions ?? []),
    [effectiveRows, consistency]
  );

  const validCount = products.filter((p) => (p.validation_errors ?? []).length === 0).length;
  const invalidCount = products.length - validCount;
  const issueCount = consistency?.issues.length ?? 0;
  const uploadEnabled = Boolean(consistency?.checked) && products.length > 0;

  const columns = [
    { field: 'name', label: t('validation.name'), productLevel: true },
    { field: 'reference', label: t('validation.reference') },
    { field: 'price', label: t('validation.price'), numeric: true },
    { field: 'wholesale_price', label: t('validation.wholesalePrice'), numeric: true },
    { field: 'quantity', label: t('validation.quantity'), numeric: true },
    { field: 'brand', label: t('validation.brand'), productLevel: true },
    { field: 'category', label: t('validation.category'), productLevel: true },
    { field: 'tax', label: t('validation.tax'), productLevel: true },
    { field: 'description_short', label: t('validation.descriptionShort'), productLevel: true },
    { field: 'description', label: t('validation.description'), productLevel: true }
  ];

  return (
    <section className="card">
      <h2>{t('validation.title')}</h2>

      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={runValidate}>
          {t('validation.validateButton')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !uploadEnabled}
          title={uploadEnabled ? undefined : t('validation.uploadDisabled')}
          onClick={runUpload}
        >
          {t('validation.uploadButton')}
        </button>
      </div>

      {products.length > 0 && (
        <>
          <div className="chips">
            <span className="chip">{t('validation.total', { count: products.length })}</span>
            <span className="chip">{t('validation.valid', { count: validCount })}</span>
            <span className="chip">{t('validation.withErrors', { count: invalidCount })}</span>
            {consistency?.checked ? (
              <>
                <span className="chip">{t('validation.consistencyIssues', { count: issueCount })}</span>
                <span className="chip">{t('validation.notFound', { count: consistency.not_found_count })}</span>
              </>
            ) : (
              <span className="chip">{t('validation.consistencySkipped')}</span>
            )}
          </div>

          <p className="hint">{t('validation.editHint')}</p>

          <table className="data">
            <thead>
              <tr>
                <th>{t('validation.ean')}</th>
                {columns.map((column) => (
                  <th key={column.field}>{column.label}</th>
                ))}
                <th>{t('validation.errors')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const rowEdits = edits[product.id] ?? {};
                const rowLabel = product.ean ?? product.id;
                return (
                  <tr key={product.id}>
                    <td>{product.ean}</td>
                    {columns.map((column) => {
                      const raw = rowEdits[column.field];
                      const value = raw !== undefined ? raw : String(product[column.field as keyof ProductData] ?? '');
                      const conflict = column.productLevel && conflicts.has(`${product.id}:${column.field}`);
                      return (
                        <td key={column.field} className={conflict ? 'cell-conflict' : undefined}>
                          <input
                            className={conflict ? 'cell-conflict' : undefined}
                            value={value}
                            inputMode={column.numeric ? 'decimal' : undefined}
                            title={conflict ? t('validation.conflictHint') : undefined}
                            aria-label={`${rowLabel} ${column.label}`}
                            onChange={(event) => handleEdit(product.id, column.field, event.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td title={(product.validation_errors ?? []).map((e) => e.message).join('\n')}>
                      {(product.validation_errors ?? []).length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {uploadSummary && (
        <div className="chips">
          <span className="chip">{t('validation.productsUpdated', { count: uploadSummary.products_updated })}</span>
          <span className="chip">{t('validation.combinationsUpdated', { count: uploadSummary.combinations_updated })}</span>
          <span className="chip">{t('validation.stockUpdated', { count: uploadSummary.stock_updated })}</span>
          <span className="chip">
            {t('validation.failedOperations', {
              count: uploadSummary.results.filter((r) => r.status === 'failed').length
            })}
          </span>
        </div>
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
