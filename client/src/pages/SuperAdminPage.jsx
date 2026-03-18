import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5002';

export default function SuperAdminPage() {
    const [saToken, setSaToken] = useState(sessionStorage.getItem('sa_token'));
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    const [users, setUsers] = useState([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [createError, setCreateError] = useState('');
    const [createLoading, setCreateLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        if (saToken) fetchUsers();
    }, [saToken]);

    async function handleLogin(e) {
        e.preventDefault();
        setLoginError('');
        setLoginLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/superadmin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');

            sessionStorage.setItem('sa_token', data.token);
            setSaToken(data.token);
        } catch (err) {
            setLoginError(err.message);
        } finally {
            setLoginLoading(false);
        }
    }

    async function fetchUsers() {
        setFetchLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/superadmin/users`, {
                headers: { Authorization: `Bearer ${saToken}` }
            });
            if (!res.ok) {
                if (res.status === 401) {
                    handleLogout();
                    return;
                }
                throw new Error('Failed to fetch users');
            }
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            console.error(err);
        } finally {
            setFetchLoading(false);
        }
    }

    async function handleCreateUser(e) {
        e.preventDefault();
        setCreateError('');
        setSuccessMsg('');
        setCreateLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/superadmin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${saToken}`
                },
                body: JSON.stringify({ username: newUsername, password: newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create user');

            setNewUsername('');
            setNewPassword('');
            setSuccessMsg(`User "${data.username}" created successfully!`);
            fetchUsers();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setCreateError(err.message);
        } finally {
            setCreateLoading(false);
        }
    }

    async function handleDeleteUser(id, username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/superadmin/users/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${saToken}` }
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete user');
            }
            setSuccessMsg(`User "${username}" deleted.`);
            fetchUsers();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setCreateError(err.message);
        }
    }

    function handleLogout() {
        sessionStorage.removeItem('sa_token');
        setSaToken(null);
    }

    // ── SUPERADMIN LOGIN ──
    if (!saToken) {
        return (
            <div className="login-page superadmin-login-page">
                <div className="login-card">
                    <div className="login-card__header">
                        <div className="sa-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <h1 className="login-card__title">Super Admin</h1>
                        <p className="login-card__subtitle">ACROSSTEK Management Console</p>
                    </div>

                    <form className="login-card__form" onSubmit={handleLogin}>
                        {loginError && (
                            <div className="login-card__error">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                {loginError}
                            </div>
                        )}

                        <div className="login-card__field">
                            <label htmlFor="sa-username">Username</label>
                            <input
                                id="sa-username"
                                type="text"
                                value={loginUsername}
                                onChange={e => setLoginUsername(e.target.value)}
                                placeholder="Superadmin username"
                                required
                                autoFocus
                            />
                        </div>

                        <div className="login-card__field">
                            <label htmlFor="sa-password">Password</label>
                            <input
                                id="sa-password"
                                type="password"
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                                placeholder="Superadmin password"
                                required
                            />
                        </div>

                        <button type="submit" className="btn btn-primary login-card__btn" disabled={loginLoading}>
                            {loginLoading ? (
                                <>
                                    <span className="login-card__btn-spinner"></span>
                                    Authenticating...
                                </>
                            ) : (
                                'Access Console'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ── SUPERADMIN PANEL ──
    return (
        <div className="sa-panel">
            <header className="sa-panel__header">
                <div className="sa-panel__header-left">
                    <div className="sa-badge sa-badge--small">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <div>
                        <h1>Super Admin Console</h1>
                        <p>Manage user accounts</p>
                    </div>
                </div>
                <button className="btn btn-ghost" onClick={handleLogout}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16,17 21,12 16,7" /><line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                </button>
            </header>

            <div className="sa-panel__content">
                {/* Create User Card */}
                <div className="sa-card">
                    <h2 className="sa-card__title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                        </svg>
                        Create New User
                    </h2>

                    <form className="sa-card__form" onSubmit={handleCreateUser}>
                        {createError && (
                            <div className="login-card__error">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                {createError}
                            </div>
                        )}
                        {successMsg && (
                            <div className="sa-success">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" />
                                </svg>
                                {successMsg}
                            </div>
                        )}

                        <div className="sa-card__form-row">
                            <div className="login-card__field">
                                <label htmlFor="new-username">Username</label>
                                <input
                                    id="new-username"
                                    type="text"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    placeholder="min. 3 characters"
                                    required
                                    minLength={3}
                                />
                            </div>
                            <div className="login-card__field">
                                <label htmlFor="new-password">Password</label>
                                <input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="min. 6 characters"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary sa-card__create-btn"
                                disabled={createLoading}
                            >
                                {createLoading ? 'Creating...' : 'Create User'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Users Table Card */}
                <div className="sa-card">
                    <div className="sa-card__title-row">
                        <h2 className="sa-card__title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                            </svg>
                            User Accounts
                            <span className="sa-card__count">{users.length}</span>
                        </h2>
                        <button className="btn btn-ghost btn-sm" onClick={fetchUsers} disabled={fetchLoading}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={fetchLoading ? 'spin' : ''}>
                                <polyline points="23,4 23,10 17,10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {users.length === 0 ? (
                        <div className="sa-empty">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="17" y1="11" x2="23" y2="11" />
                            </svg>
                            <p>No user accounts yet</p>
                            <span>Create one above to get started.</span>
                        </div>
                    ) : (
                        <div className="sa-table-wrap">
                            <table className="sa-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Username</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u, i) => (
                                        <tr key={u._id}>
                                            <td className="sa-table__num">{i + 1}</td>
                                            <td className="sa-table__user">
                                                <div className="sa-table__avatar">
                                                    {u.username.charAt(0).toUpperCase()}
                                                </div>
                                                {u.username}
                                            </td>
                                            <td className="sa-table__date">
                                                {new Date(u.createdAt).toLocaleDateString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDeleteUser(u._id, u.username)}
                                                >
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3,6 5,6 21,6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                                    </svg>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
