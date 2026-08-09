import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon } from '../components/common/Icons';

const recentPages = [
  { label: 'Dashboard', path: '/', icon: 'dashboard' as const },
  { label: 'Detection', path: '/detection', icon: 'detection' as const },
  { label: 'Training', path: '/training', icon: 'training' as const },
  { label: 'Models', path: '/models', icon: 'models' as const },
  { label: 'Datasets', path: '/datasets', icon: 'datasets' as const },
  { label: 'Settings', path: '/settings', icon: 'settings' as const },
];

const allRoutes = [
  '/', '/detection', '/training', '/data-upload', '/models',
  '/analytics', '/datasets', '/logs', '/settings', '/admin',
];

export default function NotFound() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = search.trim().toLowerCase();
    if (!term) return;
    const match = allRoutes.find((r) => r.replace('/', '').includes(term));
    if (match) {
      navigate(match);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg text-center"
      >
        <div className="mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-primary">404</span>
          </div>
          <h1 className="text-2xl font-bold text-dark-heading mb-2">Page Not Found</h1>
          <p className="text-sm text-dark-text">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-text" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for a page..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </form>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Go to Dashboard
          </Link>
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
          >
            Go Back
          </button>
        </div>

        <div>
          <h3 className="text-xs font-medium text-dark-text mb-3">Quick Navigation</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recentPages.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-dark-surface border border-dark-border hover:border-primary/30 hover:bg-dark-surface/80 transition-colors text-left"
              >
                <Icon name={page.icon} className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs text-dark-heading truncate">{page.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-dark-text/40 mt-8">
          CaptchaMaster AI Trainer v2.0
        </p>
      </motion.div>
    </div>
  );
}
