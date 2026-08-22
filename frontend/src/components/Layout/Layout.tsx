import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Footer from './Footer';
import { Outlet, useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/detection': 'Captcha Detection',
  '/scene-training': 'Scene Training',
  '/training': 'Model Training',
  '/dataset-upload': 'Dataset Upload',
  '/models': 'Model Management',
  '/analytics': 'Analytics',
  '/datasets': 'Datasets',
  '/logs': 'Logs',
  '/settings': 'Settings',
  '/admin': 'Admin Dashboard',
  '/404': 'Page Not Found',
};

export default function Layout() {
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
