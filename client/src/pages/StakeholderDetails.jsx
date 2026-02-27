import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function StakeholderDetails() {
    const [activeTab, setActiveTab] = useState('2a');
    const [embedUrls, setEmbedUrls] = useState({ table2a: '', table2b: '' });
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    useEffect(() => {
        fetch(`${API_URL}/api/sheets/config`)
            .then(r => r.json())
            .then(d => { if (d.embedUrls) setEmbedUrls(d.embedUrls); })
            .catch(() => { });
    }, []);

    const currentUrl = activeTab === '2a' ? embedUrls.table2a : embedUrls.table2b;

    async function handleForceSync() {
        setSyncing(true);
        setSyncResult(null);
        try {
            const r = await fetch(`${API_URL}/api/sheets/sync/force`, { method: 'POST' });
            const data = await r.json();
            if (data.success) {
                setSyncResult({ ok: true, msg: `Synced: ${data.table2a} job stakeholders, ${data.table2b} funding stakeholders` });
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
                    <h1 className="page-header__title">Stakeholder Details</h1>
                    <p className="page-header__subtitle">View employee and contact data in Google Sheets</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <button
                        className="btn btn-orange"
                        onClick={handleForceSync}
                        disabled={syncing}
                        id="btn-force-sync-stakeholders"
                        title="Push all MongoDB employee data to Google Sheets"
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
                <button className={`tab ${activeTab === '2a' ? 'active' : ''}`} onClick={() => setActiveTab('2a')} id="tab-2a">
                    Job Posting Stakeholders
                </button>
                <button className={`tab ${activeTab === '2b' ? 'active' : ''}`} onClick={() => setActiveTab('2b')} id="tab-2b">
                    Funding Company Stakeholders
                </button>
            </div>

            {currentUrl ? (
                <div className="sheet-embed">
                    <iframe src={currentUrl} title={`Table ${activeTab}`} key={activeTab} />
                </div>
            ) : (
                <div className="sheet-placeholder">
                    {embedUrls.table2a === '' && embedUrls.table2b === ''
                        ? 'No sheets found — click "Sync All to Sheets" to push existing data, or run a pipeline first.'
                        : 'Loading sheet…'}
                </div>
            )}
        </div>
    );
}
