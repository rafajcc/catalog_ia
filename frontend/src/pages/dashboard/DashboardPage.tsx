import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useBackendStatus } from '../../hooks/useBackendStatus';
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
  { id: 'configuration', key: 'tabs.configuration' },
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
  const status = useBackendStatus();

  const tabs: TabItem[] = TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.key) }));

  function handleTabChange(id: string) {
    setActiveTab(id);
  }

  const requiresData = activeTab !== 'upload' && activeTab !== 'configuration';

  return (
    <div>
      <AppHeader status={status} />
      <TabNav tabs={tabs} active={activeTab} onChange={handleTabChange} />

      <main style={{ padding: '1.25rem', maxWidth: 900, margin: '0 auto' }}>
        {dataId && (
          <div className="chips" style={{ marginBottom: '0.75rem' }}>
            <span className="chip">{t('common.dataId', { id: dataId })}</span>
          </div>
        )}

        {activeTab === 'upload' && <UploadSection dataId={dataId} onDataReady={setDataId} />}
        {activeTab === 'configuration' && <ConfigurationForm />}
        {activeTab === 'validation' &&
          (dataId ? <ValidationPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
        {activeTab === 'images' &&
          (dataId ? <ImageMatchingPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
        {activeTab === 'ai' &&
          (dataId ? <SuggestionsPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
        {activeTab === 'sync' &&
          (dataId ? <SyncPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
        {activeTab === 'review' &&
          (dataId ? <ReviewPanel dataId={dataId} /> : <p className="message error">{t('dashboard.emptyDataNotice')}</p>)}
      </main>

      {requiresData && !dataId && (
        <footer style={{ textAlign: 'center', padding: '0 1.25rem 1.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
          {t('dashboard.footerUnlock')}
        </footer>
      )}
    </div>
  );
}
