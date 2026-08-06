import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';
import { useI18n } from '../../i18n';
import { UploadItem } from '../../types';

interface Message {
  kind: 'success' | 'error';
  text: string;
}

interface UploadSectionProps {
  onDataReady?: (dataId: string) => void;
  uploadedCsvs?: UploadItem[];
  uploadedImages?: UploadItem[];
  onCsvUploaded?: (item: UploadItem) => void;
  onImagesUploaded?: (items: UploadItem[]) => void;
  onDeleteCsv?: (id: string) => void;
  onDeleteImage?: (name: string) => void;
  onDeleteAllCsvs?: () => void;
  onDeleteAllImages?: () => void;
}

export default function UploadSection({
  onDataReady,
  uploadedCsvs = [],
  uploadedImages = [],
  onCsvUploaded,
  onImagesUploaded,
  onDeleteCsv,
  onDeleteImage,
  onDeleteAllCsvs,
  onDeleteAllImages
}: UploadSectionProps) {
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
      if (id) {
        setMessage({ kind: 'success', text: t('upload.successProcessed', { id }) });
        onDataReady?.(id);
        onCsvUploaded?.({ id: upload.file_id ?? '', name: csvFile.name });
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

  return (
    <section className="card">
      <h2>{t('upload.title')}</h2>

      <div className="field">
        <label htmlFor="csv-input">
          {t('upload.csvLabel')}
          {uploadedCsvs.length > 0 && (
            <span className="upload-counter">{t('upload.uploadedCsvs', { count: uploadedCsvs.length })}</span>
          )}
        </label>
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
                <button type="button" className="btn btn-small" onClick={onDeleteAllCsvs}>
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
                      aria-label={`${t('upload.delete')} ${item.name}`}
                      onClick={() => onDeleteCsv?.(item.id)}
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
                <button type="button" className="btn btn-small" onClick={onDeleteAllImages}>
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
                      aria-label={`${t('upload.delete')} ${item.name}`}
                      onClick={() => onDeleteImage?.(item.id)}
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
