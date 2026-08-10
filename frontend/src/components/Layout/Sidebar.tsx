import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Image } from 'antd';
import { Icon } from '../common/Icons';
import type { IconName } from '../../types';

const SIDEBAR_WIDTH = '260px';
const SIDEBAR_COLLAPSED_WIDTH = '70px';

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/detection', label: 'Detection', icon: 'detection' },
  { to: '/training', label: 'Training', icon: 'training' },
  { to: '/data-upload', label: 'Data Upload', icon: 'images' },
  { to: '/models', label: 'Models', icon: 'models' },
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
  { to: '/datasets', label: 'Datasets', icon: 'datasets' },
  { to: '/logs', label: 'Logs', icon: 'logs' },
  { to: '/admin', label: 'Admin', icon: 'users' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function updateSidebarVar(collapsed: boolean) {
  document.documentElement.style.setProperty(
    '--sidebar-width',
    collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    updateSidebarVar(collapsed);
  }, [collapsed]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
  };

  const handleNavClick = () => {
    if (mobileOpen) onClose();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300 border-r border-dark-border
          lg:w-[var(--sidebar-width,260px)] w-[260px]
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
        style={{ background: 'var(--color-dark-sidebar, #121218)' }}
      >
        <div className="flex items-center h-14 lg:h-16 px-3 lg:px-4 border-b border-dark-border gap-3">
          <Image
            src="/logo.png"
            alt="CaptchaMaster"
            preview={false}
            className="rounded-lg object-contain shrink-0"
            width={32}
            height={32}
          />
          {!collapsed && (
            <span className="text-sm font-semibold text-dark-heading truncate">
              CM Trainer
            </span>
          )}
          <button
            onClick={onClose}
            className="lg:hidden ml-auto p-1.5 rounded-md text-dark-text hover:bg-dark-surface hover:text-dark-heading"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-2 lg:py-3 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 my-0.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-dark-text hover:bg-dark-surface hover:text-dark-heading'
                }`
              }
            >
              <Icon name={item.icon} className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-dark-border p-2 lg:p-3">
          <button
            onClick={toggleCollapsed}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors"
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} className="w-4 h-4" />
            {!collapsed && <span className="hidden lg:inline">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
