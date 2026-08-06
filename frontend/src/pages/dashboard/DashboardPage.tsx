import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { useBackendStatus } from '../../hooks/useBackendStatus';
import { getApiService } from '../../services/api-service';
import { UploadItem } from '../../types';
import AppHeader from '../../components/layout/AppHeader';
import TabNav, { TabItem } from '../../components/layout/TabNav';
import UploadSection from '../../components/data-upload/UploadSection';
import ConfigurationForm from '../../components/configuration/ConfigurationForm';
import ValidationPanel from '../../components/validation/ValidationPanel';
import ImageMatchingPanel from '../../components/image-matching/ImageMatchingPanel';
import SuggestionsPanel from '../../components/ai-suggestions/SuggestionsPanel';
import SyncPanel from '../../components/sync/SyncPanel';
import ReviewPanel from '../../components/review/ReviewPanel';

const TAB_KEYS: Array<{ id: string; key: string }> = [
  { id: 'upload', key: 'tabs.upload' },
  { id: 'validation', key: 'tabs.validation' },
  { id: 'images', key: 'tabs.images' },
  { id: 'ai', key: 'tabs.ai' },
  { id: 'sync', key: 'tabs.sync' },
  { id: 'review', key: 'tabs.review' }
];

export default function DashboardPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('upload');
  const [dataId, setDataId] = useState<string | undefined>(undefined);
  const [dataVersion, setDataVersion] = useState(0);
  const [validatedAtVersion, setValidatedAtVersion] = useState<number | null>(null);
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [uploadedCsvs, setUploadedCsvs] = useState<UploadItem[]>([]);
  const [uploadedImages, setUploadedImages] = useState<UploadItem[]>([]);
  const status = useBackendStatus();

  const validated = dataId !== undefined && validatedAtVersion !== null && validatedAtVersion === dataVersion;

  async function refreshUploads() {
    const res = await getApiService().getUploads();
    const data = res?.data ?? {};
    const csvs = Array.isArray(data.csvs) ? data.csvs : [];
    const images = Array.isArray(data.images) ? data.images : [];
    const csvsChanged =
      csvs.length !== uploadedCsvs.length ||
      csvs.some(
        (csv: UploadItem, index: number) =>
          uploadedCsvs[index]?.id !== csv.id || uploadedCsvs[index]?.name !== csv.name
      );
    setUploadedCsvs(csvs);
    setUploadedImages(images);
    if (csvsChanged) {
      setDataVersion((value) => value + 1);
      setValidatedAtVersion(null);
    }
    if (csvs.length === 0) {
      setDataId(undefined);
      setActiveTab('upload');
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getApiService().getUploads();
        if (!active) return;
        const data = res?.data ?? {};
        setUploadedCsvs(Array.isArray(data.csvs) ? data.csvs : []);
        setUploadedImages(Array.isArray(data.images) ? data.images : []);
      } catch {
        /* backend may be offline */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const tabs: TabItem[] = TAB_KEYS.map((tab) => ({
    id: tab.id,
    label: t(tab.key),
    disabled:
      tab.id === 'images'
        ? !(dataId && uploadedImages.length > 0)
        : tab.id === 'ai' || tab.id === 'sync' || tab.id === 'review'
          ? !validated
          : tab.id !== 'upload' && !dataId
  }));

  function handleTabChange(id: string) {
    setActiveTab(id);
    setShowConfiguration(false);
  }

  function handleDataReady(id: string) {
    setDataId(id);
    setValidatedAtVersion(null);
  }

  function handleCsvUploaded(item: UploadItem) {
    setUploadedCsvs((prev) => [...prev, item]);
    setDataVersion((value) => value + 1);
  }

  function handleImagesUploaded(items: UploadItem[]) {
    setUploadedImages((prev) => [...prev, ...items]);
  }

  const requiresData = activeTab !== 'upload';

  return (
    <div>
      <AppHeader
        status={status}
        configurationOpen={showConfiguration}
        onToggleConfiguration={() => setShowConfiguration((value) => !value)}
      />
      <TabNav tabs={tabs} active={activeTab} onChange={handleTabChange} />

      <main style={{ padding: '1.25rem', maxWidth: 900, margin: '0 auto' }}>
        {showConfiguration ? (
          <ConfigurationForm />
        ) : (
          <>
            {activeTab === 'upload' && (
              <UploadSection
                onDataReady={handleDataReady}
                uploadedCsvs={uploadedCsvs}
                uploadedImages={uploadedImages}
                onCsvUploaded={handleCsvUploaded}
                onImagesUploaded={handleImagesUploaded}
                onUploadsChanged={refreshUploads}
              />
            )}
            {activeTab === 'validation' &&
              (dataId ? (
                <ValidationPanel
                  dataId={dataId}
                  csvFiles={uploadedCsvs}
                  autoLoad={validatedAtVersion !== null && validatedAtVersion === dataVersion}
                  onValidated={() => setValidatedAtVersion(dataVersion)}
                />
              ) : (
                <p className="message error">{t('dashboard.emptyDataNotice')}</p>
              ))}
            {activeTab === 'images' &&
              (dataId && uploadedImages.length > 0 ? (
                <ImageMatchingPanel dataId={dataId} />
              ) : (
                <p className="message error">{t('dashboard.emptyDataNotice')}</p>
              ))}
            {activeTab === 'ai' &&
              (dataId ? <SuggestionsPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
            {activeTab === 'sync' &&
              (dataId ? <SyncPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
            {activeTab === 'review' &&
              (dataId ? <ReviewPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
          </>
        )}
      </main>

      {!showConfiguration && requiresData && !dataId && (
        <footer style={{ textAlign: 'center', padding: '0 1.25rem 1.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
          {t('dashboard.footerUnlock')}
        </footer>
      )}
    </div>
  );
}
