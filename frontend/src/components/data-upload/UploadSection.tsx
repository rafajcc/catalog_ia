import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { downloadBlob, getApiError, getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { UploadItem } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

const CSV_GUIDE_COLUMNS: Array<{ key: string; required: boolean }> = [
  { key: 'ean', required: false },
  { key: 'reference', required: false },
  { key: 'name', required: true },
  { key: 'sku', required: false },
  { key: 'price', required: false },
  { key: 'wholesale_price', required: false },
  { key: 'quantity', required: false },
  { key: 'stock', required: false },
  { key: 'brand', required: false },
  { key: 'manufacturer', required: false },
  { key: 'category', required: false },
  { key: 'tax', required: false },
  { key: 'weight', required: false },
  { key: 'description_short', required: false },
  { key: 'description', required: false },
  { key: 'image_hints', required: false }
];

const CSV_GUIDE_EXAMPLE =
  '8412345678901,REF-001,Laptop Pro,LP15-001,999.99,899.99,50,50,Dell,Dell Inc.,Electronics,21,2.5,Desc corta,"Descripción larga con comas",EAN-8412345678901';

interface UploadSectionProps {
  onDataReady?: (dataId: string) => void;
  uploadedCsvs?: UploadItem[];
  uploadedImages?: UploadItem[];
  onCsvUploaded?: (item: UploadItem) => void;
  onImagesUploaded?: (items: UploadItem[]) => void;
  onUploadsChanged?: () => void;
}

export default function UploadSection({
  onDataReady,
  uploadedCsvs = [],
  uploadedImages = [],
  onCsvUploaded,
  onImagesUploaded,
  onUploadsChanged
}: UploadSectionProps) {
  const api = getApiService();
  const { t } = useI18n();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [showCsvGuide, setShowCsvGuide] = useState(false);

  async function handleCsvUpload() {
    if (!csvFile) {
      setMessage({ kind: 'error', text: t('upload.errorNoCsv') });
      return;
    }
    if (!csvFile.name.toLowerCase().endsWith('.csv')) {
      setMessage({ kind: 'error', text: t('upload.errorNotCsv', { name: csvFile.name }) });
      return;
    }
    if (uploadedCsvs.some((item) => item.name === csvFile.name)) {
      setMessage({ kind: 'error', text: t('upload.errorDuplicateCsv', { name: csvFile.name }) });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const upload = await api.uploadCSV(csvFile);
      const parsed = await api.parseCSV(upload.file_id ?? '');
      const id = parsed?.data?.data_id ?? upload.file_id ?? '';
      setMessage({ kind: 'success', text: t('upload.successUploaded', { name: csvFile.name }) });
      onCsvUploaded?.({ id: upload.file_id ?? '', name: csvFile.name });
      if (id) {
        onDataReady?.(id);
      }
    } catch (error) {
      setMessage({ kind: 'error', text: formatUploadError(error) });
    } finally {
      setBusy(false);
    }
  }

  function formatUploadError(error: unknown): string {
    const apiError = getApiError(error);
    const details = apiError?.details ?? {};
    if (apiError?.code === 'CSV_COLUMN_COUNT_MISMATCH') {
      return t('upload.errorCsvColumnCount', {
        name: String(details.name ?? ''),
        columns: String(details.columns ?? ''),
        expected: String(details.expected ?? '')
      });
    }
    if (apiError?.code === 'CSV_MISSING_COLUMNS') {
      return t('upload.errorCsvMissingColumns', {
        name: String(details.name ?? ''),
        missing: Array.isArray(details.missing) ? details.missing.join(', ') : String(details.missing ?? '')
      });
    }
    return getErrorMessage(error);
  }

  async function handleImageUpload() {
    if (imageFiles.length === 0) {
      setMessage({ kind: 'error', text: t('upload.errorNoImages') });
      return;
    }
    const invalid = imageFiles.find((file) => !/\.jpe?g$/i.test(file.name));
    if (invalid) {
      setMessage({ kind: 'error', text: t('upload.errorNotImage', { name: invalid.name }) });
      return;
    }
    const duplicate = imageFiles.find((file) => uploadedImages.some((item) => item.name === file.name));
    if (duplicate) {
      setMessage({ kind: 'error', text: t('upload.errorDuplicateImage', { name: duplicate.name }) });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.uploadImages(imageFiles);
      setMessage({ kind: 'success', text: t('upload.successImages', { count: imageFiles.length }) });
      onImagesUploaded?.(imageFiles.map((file) => ({ id: file.name, name: file.name })));
      setImageFiles([]);
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleFolderSelect() {
    if (!folderPath.trim()) {
      setMessage({ kind: 'error', text: t('upload.errorNoFolder') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.selectImageFolder(folderPath);
      setMessage({ kind: 'success', text: t('upload.successFolder') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await api.getCsvTemplate();
      downloadBlob(blob, 'catalog_template.csv');
      setMessage({ kind: 'success', text: t('upload.successTemplate') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCsv(item: UploadItem) {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteCsvUpload(item.id);
      setMessage({ kind: 'success', text: t('upload.successDeletedCsv', { name: item.name }) });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
      onUploadsChanged?.();
    }
  }

  async function handleDeleteImage(item: UploadItem) {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteImageUpload(item.id);
      setMessage({ kind: 'success', text: t('upload.successDeletedImage', { name: item.name }) });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
      onUploadsChanged?.();
    }
  }

  async function handleDeleteAllCsvs() {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAllCsvs();
      setMessage({ kind: 'success', text: t('upload.successDeletedAllCsvs') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
      onUploadsChanged?.();
    }
  }

  async function handleDeleteAllImages() {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAllImages();
      setMessage({ kind: 'success', text: t('upload.successDeletedAllImages') });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
      onUploadsChanged?.();
    }
  }

  return (
    <section className="card">
      <h2>{t('upload.title')}</h2>

      <div className="field">
        <div className="field-header">
          <label htmlFor="csv-input">
            {t('upload.csvLabel')}
            {uploadedCsvs.length > 0 && (
              <span className="upload-counter">{t('upload.uploadedCsvs', { count: uploadedCsvs.length })}</span>
            )}
          </label>
          <button
            type="button"
            className="btn btn-small help-button"
            aria-label={t('upload.guide.toggle')}
            aria-expanded={showCsvGuide}
            onClick={() => setShowCsvGuide((value) => !value)}
          >
            ?
          </button>
        </div>
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          disabled={busy}
          onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
        />
        <button type="button" className="btn primary" disabled={busy} onClick={handleCsvUpload}>
          {t('upload.csvButton')}
        </button>
        <button type="button" className="btn primary" disabled={busy} onClick={handleDownloadTemplate}>
          {t('upload.templateButton')}
        </button>
        {showCsvGuide && (
          <div className="guide-box">
            <p>{t('upload.guide.intro')}</p>
            <table className="data guide-table">
              <thead>
                <tr>
                  <th>{t('upload.guide.col')}</th>
                  <th>{t('upload.guide.description')}</th>
                  <th>{t('upload.guide.required')}</th>
                </tr>
              </thead>
              <tbody>
                {CSV_GUIDE_COLUMNS.map((column) => (
                  <tr key={column.key}>
                    <td>
                      <code>{column.key}</code>
                    </td>
                    <td>{t(`upload.guide.column.${column.key}`)}</td>
                    <td>{column.required ? t('upload.guide.requiredYes') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <strong>{t('upload.guide.example')}</strong>{' '}
              <code>{CSV_GUIDE_EXAMPLE}</code>
            </p>
            <p>{t('upload.guide.downloadHint')}</p>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="images-input">
          {t('upload.imagesLabel')}
          {uploadedImages.length > 0 && (
            <span className="upload-counter">{t('upload.uploadedImages', { count: uploadedImages.length })}</span>
          )}
        </label>
        <input
          id="images-input"
          type="file"
          accept=".jpg,.jpeg"
          multiple
          disabled={busy}
          onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="btn primary" disabled={busy} onClick={handleImageUpload}>
          {t('upload.imagesButton')}
        </button>
      </div>

      <div className="field">
        <label htmlFor="folder-input">{t('upload.folderLabel')}</label>
        <input
          id="folder-input"
          type="text"
          value={folderPath}
          disabled={busy}
          placeholder={t('upload.folderPlaceholder')}
          onChange={(event) => setFolderPath(event.target.value)}
        />
        <button type="button" className="btn primary" disabled={busy} onClick={handleFolderSelect}>
          {t('upload.folderButton')}
        </button>
      </div>

      {(uploadedCsvs.length > 0 || uploadedImages.length > 0) && (
        <div className="uploaded-list">
          <h3>{t('upload.uploadedFilesTitle')}</h3>
          {uploadedCsvs.length > 0 && (
            <div className="uploaded-group">
              <div className="uploaded-group-header">
                <strong>{t('upload.uploadedCsvsTitle')}</strong>
                <button type="button" className="btn btn-small" disabled={busy} onClick={handleDeleteAllCsvs}>
                  {t('upload.deleteAll')}
                </button>
              </div>
              <ul>
                {uploadedCsvs.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      aria-label={`${t('upload.delete')} ${item.name}`}
                      onClick={() => handleDeleteCsv(item)}
                    >
                      {t('upload.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {uploadedImages.length > 0 && (
            <div className="uploaded-group">
              <div className="uploaded-group-header">
                <strong>{t('upload.uploadedImagesTitle')}</strong>
                <button type="button" className="btn btn-small" disabled={busy} onClick={handleDeleteAllImages}>
                  {t('upload.deleteAll')}
                </button>
              </div>
              <ul>
                {uploadedImages.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      aria-label={`${t('upload.delete')} ${item.name}`}
                      onClick={() => handleDeleteImage(item)}
                    >
                      {t('upload.delete')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
