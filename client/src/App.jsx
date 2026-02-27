import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CompanyDetails from './pages/CompanyDetails';
import StakeholderDetails from './pages/StakeholderDetails';
import LogsPage from './pages/LogsPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/companies" element={<CompanyDetails />} />
          <Route path="/stakeholders" element={<StakeholderDetails />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
