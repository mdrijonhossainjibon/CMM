import { Icon } from '../common/Icons';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { toggleTheme } from '../../store/slices/themeSlice';
import { disconnect } from '../../store/slices/serverSlice';

interface TopbarProps {
  title: string;
  onToggleSidebar?: () => void;
}

const isDev = import.meta.env.DEV;

export default function Topbar({ title, onToggleSidebar }: TopbarProps) {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector((state) => state.theme);
  const { serverUrl } = useAppSelector((state) => state.server);

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between h-14 lg:h-16 px-3 sm:px-4 lg:px-6 border-b border-dark-border backdrop-blur-md"
      style={{ background: 'var(--color-dark-topbar, rgba(18,18,24,0.8))' }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors shrink-0"
          >
            <Icon name="layout" className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-sm sm:text-lg font-semibold text-dark-heading truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="text-[10px] sm:text-xs text-dark-text hidden md:block truncate max-w-[150px] lg:max-w-[200px]" title={serverUrl}>
          {serverUrl}
        </span>
        <button
          onClick={() => dispatch(toggleTheme())}
          className="p-1.5 sm:p-2 rounded-lg text-dark-text hover:bg-dark-surface hover:text-dark-heading transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        {!isDev && (
          <button
            onClick={() => dispatch(disconnect())}
            className="px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>
    </header>
  );
}
