import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:5002';

export default function WorkflowHeader() {
    const [workflow, setWorkflow] = useState(null);

    useEffect(() => {
        const socket = io(API_URL);

        socket.on('workflow:progress', (data) => {
            setWorkflow(data);
        });

        // Fetch initial status
        fetch(`${API_URL}/api/workflow/progress`)
            .then(r => r.json())
            .then(d => { if (d.workflow) setWorkflow(d.workflow); })
            .catch(() => { });

        return () => socket.disconnect();
    }, []);

    if (!workflow || workflow.status === 'idle') return null;

    const isComplete = workflow.status === 'completed';
    const isFailed = workflow.status === 'failed';

    return (
        <div className={`workflow-header${isComplete ? ' completed' : ''}${isFailed ? ' failed' : ''}`}>
            <div className="workflow-header__activity">
                {workflow.latestActivity || 'Running pipeline...'}
            </div>
            <div className="workflow-header__progress-wrap">
                <div className="workflow-header__progress-bar">
                    <div
                        className="workflow-header__progress-fill"
                        style={{ width: `${workflow.progress || 0}%` }}
                    />
                </div>
                <span className="workflow-header__percent">{workflow.progress || 0}%</span>
            </div>
        </div>
    );
}
