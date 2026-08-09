import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Layout/Sidebar';
import Topbar from '../components/Layout/Topbar';
import Footer from '../components/Layout/Footer';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/detection': 'Captcha Detection',
  '/training': 'Model Training',
  '/data-upload': 'Data Upload',
  '/models': 'Model Management',
  '/analytics': 'Analytics',
  '/datasets': 'Datasets',
  '/logs': 'Logs',
  '/settings': 'Settings',
  '/admin': 'Admin Dashboard',
};

export default function MainLayout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'CaptchaMaster';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col lg:ml-[var(--sidebar-width,260px)]">
        <Topbar title={title} onToggleSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
