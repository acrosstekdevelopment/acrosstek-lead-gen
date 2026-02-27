import ScraperCard from './ScraperCard';

export default function ScraperGrid({ title, scrapers, type, onRunSingle, onRunAll, isAnyRunning }) {
    return (
        <div className="scraper-section">
            <div className="scraper-section__header">
                <h2 className="scraper-section__title">{title}</h2>
                {type !== 'extension' && (
                    <button
                        className="btn btn-orange"
                        onClick={() => onRunAll(type)}
                        disabled={isAnyRunning}
                        id={`run-all-${type}`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21" />
                        </svg>
                        Run All
                    </button>
                )}
            </div>
            <div className="scraper-grid">
                {scrapers.map(s => (
                    <ScraperCard
                        key={s.scraperName}
                        scraper={s}
                        onClick={() => onRunSingle(s.scraperName, type)}
                    />
                ))}
            </div>
        </div>
    );
}
