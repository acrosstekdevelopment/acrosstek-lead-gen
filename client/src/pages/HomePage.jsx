import { useState, useEffect, useCallback } from 'react';
import ScraperGrid from '../components/ScraperGrid';

const API_URL = 'http://localhost:5002';

export default function HomePage() {
    const [scrapers, setScrapers] = useState([]);
    const [extensions, setExtensions] = useState([]);
    const [isAnyRunning, setIsAnyRunning] = useState(false);

    const fetchScrapers = useCallback(async () => {
        try {
            const [scraperRes, extRes] = await Promise.all([
                fetch(`${API_URL}/api/scrapers/status`).then(r => r.json()),
                fetch(`${API_URL}/api/extensions/status`).then(r => r.json())
            ]);

            const allScrapers = scraperRes.scrapers || [];
            setScrapers(allScrapers.filter(s => s.type !== 'extension'));

            // Map extension statuses to scraper-like format for ScraperCard
            const extData = (extRes.extensions || []).map(e => {
                const scraperMatch = allScrapers.find(s => s.scraperName === e.extensionName);
                return {
                    scraperName: e.extensionName,
                    type: 'extension',
                    lastRunAt: e.lastReceivedAt,
                    lastRunSuccess: e.lastReceivedAt ? true : null,
                    isRunning: scraperMatch?.isRunning || false,
                    onCooldown: scraperMatch?.onCooldown || false,
                    cooldownRemaining: scraperMatch?.cooldownRemaining || 0
                };
            });
            setExtensions(extData);
            setIsAnyRunning(allScrapers.some(s => s.isRunning));
        } catch (err) {
            console.error('Failed to fetch scrapers:', err);
        }
    }, []);

    useEffect(() => {
        fetchScrapers();
        const interval = setInterval(fetchScrapers, 5000);
        return () => clearInterval(interval);
    }, [fetchScrapers]);

    const handleRunSingle = async (name, type) => {
        try {
            await fetch(`${API_URL}/api/scrapers/run/${type}/${name}`, { method: 'POST' });
            fetchScrapers();
        } catch (err) {
            console.error('Failed to run scraper:', err);
        }
    };

    const handleRunAll = async (type) => {
        try {
            await fetch(`${API_URL}/api/scrapers/run-all/${type}`, { method: 'POST' });
            fetchScrapers();
        } catch (err) {
            console.error('Failed to run all:', err);
        }
    };

    const jobScrapers = scrapers.filter(s => s.type === 'job');
    const fundingScrapers = scrapers.filter(s => s.type === 'funding');

    return (
        <div>
            <div className="page-header">
                <h1 className="page-header__title">Dashboard</h1>
                <p className="page-header__subtitle">Manage and run your lead generation scrapers</p>
            </div>

            <ScraperGrid
                title="Job Scrapers"
                scrapers={jobScrapers}
                type="job"
                onRunSingle={handleRunSingle}
                onRunAll={handleRunAll}
                isAnyRunning={isAnyRunning}
            />

            <ScraperGrid
                title="Funding Scrapers"
                scrapers={fundingScrapers}
                type="funding"
                onRunSingle={handleRunSingle}
                onRunAll={handleRunAll}
                isAnyRunning={isAnyRunning}
            />

            <ScraperGrid
                title="Chrome Extensions"
                scrapers={extensions}
                type="extension"
                onRunSingle={handleRunSingle}
                onRunAll={handleRunAll}
                isAnyRunning={isAnyRunning}
            />
        </div>
    );
}
