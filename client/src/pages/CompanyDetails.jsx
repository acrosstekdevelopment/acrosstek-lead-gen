import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:5002';

export default function CompanyDetails() {
    const [activeTab, setActiveTab] = useState('1a');
    const [embedUrls, setEmbedUrls] = useState({ table1a: '', table1b: '' });
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    useEffect(() => {
        fetch(`${API_URL}/api/sheets/config`)
            .then(r => r.json())
            .then(d => { if (d.embedUrls) setEmbedUrls(d.embedUrls); })
            .catch(() => { });
    }, []);

    const currentUrl = activeTab === '1a' ? embedUrls.table1a : embedUrls.table1b;

    async function handleForceSync() {
        setSyncing(true);
        setSyncResult(null);
        try {
            const r = await fetch(`${API_URL}/api/sheets/sync/force`, { method: 'POST' });
            const data = await r.json();
            if (data.success) {
                setSyncResult({ ok: true, msg: `Synced: ${data.table1a} job companies, ${data.table1b} funding companies` });
                // Reload embed URLs
                const cfg = await fetch(`${API_URL}/api/sheets/config`).then(x => x.json());
                if (cfg.embedUrls) setEmbedUrls(cfg.embedUrls);
            } else {
                setSyncResult({ ok: false, msg: data.error || 'Sync failed' });
            }
        } catch (e) {
            setSyncResult({ ok: false, msg: e.message });
        } finally {
            setSyncing(false);
        }
    }

    return (
        <div>
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="page-header__title">Company Details</h1>
                    <p className="page-header__subtitle">View scraped company data in Google Sheets</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <button
                        className="btn btn-orange"
                        onClick={handleForceSync}
                        disabled={syncing}
                        id="btn-force-sync-companies"
                        title="Push all MongoDB company data to Google Sheets"
                    >
                        {syncing ? '⏳ Syncing…' : '↑ Sync All to Sheets'}
                    </button>
                    {syncResult && (
                        <span style={{ fontSize: 12, color: syncResult.ok ? '#059669' : '#DC2626', fontWeight: 500 }}>
                            {syncResult.ok ? '✅' : '❌'} {syncResult.msg}
                        </span>
                    )}
                </div>
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === '1a' ? 'active' : ''}`} onClick={() => setActiveTab('1a')} id="tab-1a">
                    Job Postings
                </button>
                <button className={`tab ${activeTab === '1b' ? 'active' : ''}`} onClick={() => setActiveTab('1b')} id="tab-1b">
                    Companies with Funding
                </button>
            </div>

            {currentUrl ? (
                <div className="sheet-embed">
                    <iframe src={currentUrl} title={`Table ${activeTab}`} key={activeTab} />
                </div>
            ) : (
                <div className="sheet-placeholder">
                    {embedUrls.table1a === '' && embedUrls.table1b === ''
                        ? 'No sheets found — click "Sync All to Sheets" to push existing data, or run a pipeline first.'
                        : 'Loading sheet…'}
                </div>
            )}
        </div>
    );
}
