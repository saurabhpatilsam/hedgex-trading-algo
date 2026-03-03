import { useState, useEffect } from 'react';
import api from '../api'; // Assuming there is an api.js or similar

export default function NetworkLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLogs = async () => {
        try {
            const response = await fetch('/api/users/logs/all');
            if (!response.ok) throw new Error("Failed to fetch logs");
            const data = await response.json();
            setLogs(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 5000); // Auto refresh every 5s
        return () => clearInterval(interval);
    }, []);

    if (loading && logs.length === 0) return <div className="card"><p>Loading network logs...</p></div>;

    return (
        <div className="card">
            <div className="card-header">
                <h2>🌐 Network Request Logs</h2>
                <button className="btn btn-secondary" onClick={fetchLogs}>Refresh</button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Time (UTC)</th>
                            <th>User ID</th>
                            <th>Method / URL</th>
                            <th>Status</th>
                            <th>Request Snippet</th>
                            <th>Response Snippet</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center' }}>No requests logged yet.</td></tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                                    <td>{log.user_id ? `User ${log.user_id}` : '-'}</td>
                                    <td>
                                        <strong className={
                                            log.method === 'GET' ? 'text-success' :
                                                log.method === 'POST' ? 'text-warning' : 'text-primary'
                                        }>{log.method}</strong><br />
                                        <small style={{ wordBreak: 'break-all', color: '#888' }}>{log.url}</small>
                                    </td>
                                    <td>
                                        {log.status_code ? (
                                            <span className={`badge ${log.status_code >= 200 && log.status_code < 300 ? 'bg-success' : 'bg-danger'}`}>
                                                {log.status_code}
                                            </span>
                                        ) : (
                                            <span className="badge bg-secondary">Pending</span>
                                        )}
                                    </td>
                                    <td style={{ maxWidth: '200px' }}>
                                        <div className="code-snippet-box">
                                            {log.request_payload ? log.request_payload.substring(0, 100) + (log.request_payload.length > 100 ? '...' : '') : '-'}
                                        </div>
                                    </td>
                                    <td style={{ maxWidth: '200px' }}>
                                        <div className="code-snippet-box">
                                            {log.response_snippet ? log.response_snippet.substring(0, 100) + (log.response_snippet.length > 100 ? '...' : '') : '-'}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <style jsx="true">{`
        .code-snippet-box {
          background: var(--bg-surface-hover);
          padding: 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.85rem;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
        </div>
    );
}
