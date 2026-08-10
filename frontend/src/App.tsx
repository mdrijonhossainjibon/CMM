import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './app/store';
import Layout from './components/Layout/Layout';
import Connect from './pages/Connect';
import Dashboard from './pages/Dashboard';
import Detection from './pages/Detection';
import Training from './pages/Training';
import DataUpload from './pages/DataUpload';
import Models from './pages/Models';
import Analytics from './pages/Analytics';
import Datasets from './pages/Datasets';
import Logs from './pages/Logs';
import Migrate from './pages/Migrate';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/common/ErrorBoundary';
import ProtectedRoute from './components/common/ProtectedRoute';
import { useAppSelector } from './app/store';
import { Toaster } from 'react-hot-toast';

function AppRoutes() {
  const { isConnected } = useAppSelector((state) => state.server);

  if (!isConnected) {
    return <Connect />;
  }

  return (
    <ErrorBoundary fallbackTitle="Application Error">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/404" element={<NotFound />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="detection" element={<Detection />} />
          <Route path="training" element={<Training />} />
          <Route path="data-upload" element={<DataUpload />} />
          <Route path="models" element={<Models />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="datasets" element={<Datasets />} />
          <Route path="logs" element={<Logs />} />
          <Route path="migrate" element={<Migrate />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
        </Route>
        <Route path="/object-detection" element={<Navigate to="/" replace />} />
        <Route path="/object-detection/train" element={<Navigate to="/training" replace />} />
        <Route path="/object-detection/models" element={<Navigate to="/models" replace />} />
        <Route path="/object-detection/datasets" element={<Navigate to="/datasets" replace />} />
        <Route path="/object-detection/settings" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--color-dark-surface)',
              color: 'var(--color-dark-heading)',
              border: '1px solid var(--color-dark-border)',
            },
          }}
        />
      </BrowserRouter>
    </Provider>
  );
}
