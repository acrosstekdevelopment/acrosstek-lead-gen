export default function ScraperCard({ scraper, onClick }) {
    const getStatusClass = () => {
        if (scraper.isRunning) return 'running';
        if (scraper.onCooldown) return 'cooldown';
        if (scraper.lastRunSuccess === true) return 'success';
        if (scraper.lastRunSuccess === false) return 'failed';
        return 'idle';
    };

    const getStatusLabel = () => {
        if (scraper.isRunning) return 'Running';
        if (scraper.onCooldown) {
            const mins = Math.ceil(scraper.cooldownRemaining / 60000);
            return `Cooldown (${mins}m)`;
        }
        if (scraper.lastRunSuccess === true) return 'Success';
        if (scraper.lastRunSuccess === false) return 'Failed';
        return 'Ready';
    };

    const formatTime = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    const isDisabled = scraper.isRunning || scraper.onCooldown;
    const statusClass = getStatusClass();

    return (
        <div
            className={`scraper-card ${statusClass} ${isDisabled ? 'disabled' : ''}`}
            onClick={() => !isDisabled && onClick(scraper)}
            title={isDisabled ? getStatusLabel() : `Run ${scraper.scraperName}`}
            id={`scraper-${scraper.scraperName}`}
        >
            <div className="scraper-card__name">
                {scraper.scraperName.replace(/^scrape_/, '').replace(/_/g, ' ')}
            </div>
            <div className="scraper-card__meta">
                Last run: {formatTime(scraper.lastRunAt)}
            </div>
            <div className={`scraper-card__status status-${statusClass}`}>
                <span className={`status-dot ${statusClass}`} />
                {getStatusLabel()}
            </div>
        </div>
    );
}
