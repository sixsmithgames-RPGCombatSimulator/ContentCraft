/**
 * ContentCraft - Main Application Component
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { BrowserRouter as Router, Routes, Route, useLocation, Outlet } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { CreateProject } from './pages/CreateProject';
import { CanonManagement } from './pages/CanonManagement';
import { WorldBible } from './pages/WorldBible';
import { SessionNotes } from './pages/SessionNotes';
import { ProjectTimeline } from './pages/ProjectTimeline';
import ManualGenerator from './pages/ManualGenerator';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import CopyrightFooter from './components/layout/CopyrightFooter';
import { ProjectSubNav } from './components/layout/ProjectSubNav';
import { AiAssistantProvider } from './contexts/AiAssistantContext';
import AiAssistantPanel from './components/ai-assistant/AiAssistantPanel';
import RequireAuth from './components/auth/RequireAuth';
import { getProductConfig } from './config/products';

const PROJECT_SUBNAV_PATTERN = /^\/projects\/[^/]+(\/|$)/;

// Layout for authenticated pages (with navbar, footer, AI panel)
function AuthenticatedLayout() {
  const product = getProductConfig();
  const location = useLocation();
  const showSubNav = PROJECT_SUBNAV_PATTERN.test(location.pathname);

  return (
    <AiAssistantProvider>
      <div className={`min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-slate-950 dark:text-slate-100 flex flex-col ${product.themeClass}`}>
        <Navbar />
        {showSubNav && <ProjectSubNav />}
        <main className="container mx-auto px-4 py-8 flex-1">
          <Outlet />
        </main>
        <CopyrightFooter />
      </div>
      <AiAssistantPanel />
    </AiAssistantProvider>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Public auth routes (no layout) */}
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />

        {/* Protected routes with full app layout */}
        <Route element={<RequireAuth />}>
          <Route element={<AuthenticatedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/generator" element={<ManualGenerator />} />
            <Route path="/projects/new" element={<CreateProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/world" element={<WorldBible />} />
            <Route path="/projects/:id/notes" element={<SessionNotes />} />
            <Route path="/projects/:id/timeline" element={<ProjectTimeline />} />
            <Route path="/projects/:id/canon" element={<CanonManagement />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
