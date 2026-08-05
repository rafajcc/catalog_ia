import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

interface UploadSectionProps {
  dataId?: string;
  onDataReady?: (dataId: string) => void;
}

export default function UploadSection({ dataId, onDataReady }: UploadSectionProps) {
  const api = getApiService();
  const { t } = useI18n();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleCsvUpload() {
    if (!csvFile) {
      setMessage({ kind: 'error', text: t('upload.errorNoCsv') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const upload = await api.uploadCSV(csvFile);
      const parsed = await api.parseCSV(upload.file_id ?? '');
      const id = parsed?.data?.data_id ?? upload.file_id ?? '';
      if (id) {
        setMessage({ kind: 'success', text: t('upload.successProcessed', { id }) });
        onDataReady?.(id);
      } else {
        setMessage({ kind: 'success', text: t('upload.successUploaded') });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleImageUpload() {
    if (imageFiles.length === 0) {
      setMessage({ kind: 'error', text: t('upload.errorNoImages') });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.uploadImages(imageFiles);
      setMessage({ kind: 'success', text: t('upload.successImages', { count: imageFiles.length }) });
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

  return (
    <section className="card">
      <h2>{t('upload.title')}</h2>

      <div className="field">
        <label htmlFor="csv-input">{t('upload.csvLabel')}</label>
        <input
          id="csv-input"
          type="file"
          accept=".csv"
          disabled={busy}
          onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={handleCsvUpload}
        >
          {t('upload.csvButton')}
        </button>
      </div>

      <div className="field">
        <label htmlFor="images-input">{t('upload.imagesLabel')}</label>
        <input
          id="images-input"
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="btn" disabled={busy} onClick={handleImageUpload}>
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
        <button type="button" className="btn" disabled={busy} onClick={handleFolderSelect}>
          {t('upload.folderButton')}
        </button>
      </div>

      {dataId && (
        <div className="chips">
          <span className="chip">{t('common.dataId', { id: dataId })}</span>
        </div>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
