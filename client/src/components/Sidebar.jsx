import { NavLink } from 'react-router-dom';

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <img src="/favicon.png" alt="ACROSSTEK" />
                <h1>ACROSSTEK</h1>
            </div>
            <nav className="sidebar-nav">
                <NavLink to="/" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} end>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    Homepage
                </NavLink>
                <NavLink to="/companies" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h1" /><path d="M9 13h1" /><path d="M9 17h1" />
                    </svg>
                    Company Details
                </NavLink>
                <NavLink to="/stakeholders" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                    Stakeholder Details
                </NavLink>
                <NavLink to="/logs" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Logs
                </NavLink>
            </nav>
        </aside>
    );
}
