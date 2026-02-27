import Sidebar from './Sidebar';
import WorkflowHeader from './WorkflowHeader';

export default function Layout({ children }) {
    return (
        <div className="app-layout">
            <Sidebar />
            <div className="main-content">
                <WorkflowHeader />
                <div className="page-content">
                    {children}
                </div>
            </div>
        </div>
    );
}
