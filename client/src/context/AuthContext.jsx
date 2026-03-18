import { createContext, useContext, useState, useEffect } from 'react';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5002';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('auth_token'));
    const [loading, setLoading] = useState(true);

    // Verify existing token on mount
    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        fetch(`${API_BASE}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error('Invalid token');
                return res.json();
            })
            .then(data => {
                setUser(data.user);
            })
            .catch(() => {
                localStorage.removeItem('auth_token');
                setToken(null);
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, [token]);

    async function login(username, password) {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Login failed');
        }

        localStorage.setItem('auth_token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }

    function logout() {
        localStorage.removeItem('auth_token');
        setToken(null);
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
