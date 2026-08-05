import { useState } from 'react';
import { getApiService } from '../../services/api-service';
import { getErrorMessage } from '../../utils/download';

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
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleCsvUpload() {
    if (!csvFile) {
      setMessage({ kind: 'error', text: 'Select a CSV file first' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const upload = await api.uploadCSV(csvFile);
      const parsed = await api.parseCSV(upload.file_id ?? '');
      const id = parsed?.data?.data_id ?? upload.file_id ?? '';
      if (id) {
        setMessage({ kind: 'success', text: `File processed. Data id: ${id}` });
        onDataReady?.(id);
      } else {
        setMessage({ kind: 'success', text: 'File uploaded successfully' });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleImageUpload() {
    if (imageFiles.length === 0) {
      setMessage({ kind: 'error', text: 'Select at least one image first' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.uploadImages(imageFiles);
      setMessage({ kind: 'success', text: `${imageFiles.length} image(s) uploaded` });
      setImageFiles([]);
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleFolderSelect() {
    if (!folderPath.trim()) {
      setMessage({ kind: 'error', text: 'Enter an image folder path' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.selectImageFolder(folderPath);
      setMessage({ kind: 'success', text: 'Image folder selected' });
    } catch (error) {
      setMessage({ kind: 'error', text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Data upload</h2>

      <div className="field">
        <label htmlFor="csv-input">Product catalog (CSV)</label>
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
          Upload and process CSV
        </button>
      </div>

      <div className="field">
        <label htmlFor="images-input">Product images</label>
        <input
          id="images-input"
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))}
        />
        <button type="button" className="btn" disabled={busy} onClick={handleImageUpload}>
          Upload images
        </button>
      </div>

      <div className="field">
        <label htmlFor="folder-input">Image folder path</label>
        <input
          id="folder-input"
          type="text"
          value={folderPath}
          disabled={busy}
          placeholder="C:/images"
          onChange={(event) => setFolderPath(event.target.value)}
        />
        <button type="button" className="btn" disabled={busy} onClick={handleFolderSelect}>
          Select folder
        </button>
      </div>

      {dataId && (
        <div className="chips">
          <span className="chip">Data id: {dataId}</span>
        </div>
      )}

      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
    </section>
  );
}
