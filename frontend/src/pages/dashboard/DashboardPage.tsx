import { useEffect, useState } from 'react';
import { getApiService } from '../../services/api-service';
import AppHeader from '../../components/layout/AppHeader';
import TabNav, { TabItem } from '../../components/layout/TabNav';
import UploadSection from '../../components/data-upload/UploadSection';
import ConfigurationForm from '../../components/configuration/ConfigurationForm';
import ValidationPanel from '../../components/validation/ValidationPanel';
import ImageMatchingPanel from '../../components/image-matching/ImageMatchingPanel';
import SuggestionsPanel from '../../components/ai-suggestions/SuggestionsPanel';
import SyncPanel from '../../components/sync/SyncPanel';
import ReviewPanel from '../../components/review/ReviewPanel';

const TABS: TabItem[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'validation', label: 'Validation' },
  { id: 'images', label: 'Images' },
  { id: 'ai', label: 'AI' },
  { id: 'sync', label: 'Sync' },
  { id: 'review', label: 'Review' }
];

function EmptyDataNotice() {
  return <p className="message error">Upload a CSV first to enable this step.</p>;
}

export default function DashboardPage() {
  const api = getApiService();
  const [activeTab, setActiveTab] = useState('upload');
  const [dataId, setDataId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('Checking…');

  useEffect(() => {
    let cancelled = false;
    api
      .getSystemStatus()
      .then((result) => {
        if (!cancelled) {
          setStatus(result.success ? (result.message ?? 'Online') : 'Degraded');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('Offline');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  function handleTabChange(id: string) {
    setActiveTab(id);
  }

  const requiresData = activeTab !== 'upload' && activeTab !== 'configuration';

  return (
    <div>
      <AppHeader status={status} />
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />

      <main style={{ padding: '1.25rem', maxWidth: 900, margin: '0 auto' }}>
        {dataId && (
          <div className="chips" style={{ marginBottom: '0.75rem' }}>
            <span className="chip">Data id: {dataId}</span>
          </div>
        )}

        {activeTab === 'upload' && <UploadSection dataId={dataId} onDataReady={setDataId} />}
        {activeTab === 'configuration' && <ConfigurationForm />}
        {activeTab === 'validation' && (dataId ? <ValidationPanel dataId={dataId} /> : <EmptyDataNotice />)}
        {activeTab === 'images' && (dataId ? <ImageMatchingPanel dataId={dataId} /> : <EmptyDataNotice />)}
        {activeTab === 'ai' && (dataId ? <SuggestionsPanel dataId={dataId} /> : <EmptyDataNotice />)}
        {activeTab === 'sync' && (dataId ? <SyncPanel dataId={dataId} /> : <EmptyDataNotice />)}
        {activeTab === 'review' && (dataId ? <ReviewPanel dataId={dataId} /> : <EmptyDataNotice />)}
      </main>

      {requiresData && !dataId && (
        <footer style={{ textAlign: 'center', padding: '0 1.25rem 1.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
          Complete the upload step to unlock product workflows.
        </footer>
      )}
    </div>
  );
}
