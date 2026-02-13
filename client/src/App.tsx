/**
 * ContentCraft - Main Application Component
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { CreateProject } from './pages/CreateProject';
import { CanonManagement } from './pages/CanonManagement';
import ManualGenerator from './pages/ManualGenerator';
import CopyrightFooter from './components/layout/CopyrightFooter';
import { AiAssistantProvider } from './contexts/AiAssistantContext';
import AiAssistantPanel from './components/ai-assistant/AiAssistantPanel';

function App() {
  return (
    <Router>
      <AiAssistantProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar />
          <main className="container mx-auto px-4 py-8 flex-1">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/generator" element={<ManualGenerator />} />
              <Route path="/projects/new" element={<CreateProject />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/projects/:id/canon" element={<CanonManagement />} />
            </Routes>
          </main>
          <CopyrightFooter />
        </div>
        <AiAssistantPanel />
      </AiAssistantProvider>
    </Router>
  );
}

export default App;