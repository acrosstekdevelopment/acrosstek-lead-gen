import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:5002';

export default function LogsPage() {
    const [logs, setLogs] = useState([]);
    const containerRef = useRef(null);

    useEffect(() => {
        // Fetch initial logs
        fetch(`${API_URL}/api/logs?limit=200`)
            .then(r => r.json())
            .then(d => {
                if (d.logs) setLogs(d.logs.reverse()); // oldest first for display
            })
            .catch(() => { });

        // Listen for new logs in real-time
        const socket = io(API_URL);

        socket.on('workflow:log', (logEntry) => {
            setLogs(prev => [...prev, logEntry]);
        });

        return () => socket.disconnect();
    }, []);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs]);

    const formatTime = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-header__title">Logs</h1>
                <p className="page-header__subtitle">Real-time workflow activity and status messages</p>
            </div>

            <div className="logs-container" ref={containerRef}>
                {logs.length === 0 ? (
                    <div className="empty-state">
                        <p style={{ color: 'var(--color-gray-500)' }}>No logs yet. Run a scraper to see activity here.</p>
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div className="log-entry" key={log._id || i}>
                            <span className="log-entry__time">{formatTime(log.timestamp)}</span>
                            <span className={`log-entry__level ${log.level}`}>{log.level}</span>
                            <span className={`log-entry__message ${log.level === 'error' ? 'error' : ''} ${log.level === 'success' ? 'success' : ''}`}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
