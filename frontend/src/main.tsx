import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import ErrorBoundary from './components/common/ErrorBoundary'
import './index.css'
import App from './App'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1032968355666-im6f83ncms8vii8u1fu0rfe9bjo8phit.apps.googleusercontent.com'

// Apply persisted theme before first paint to avoid a flash of the wrong theme.
const storedTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
document.documentElement.classList.remove('dark', 'light')
document.documentElement.classList.add(storedTheme)
document.documentElement.setAttribute('data-theme', storedTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </GoogleOAuthProvider>
  </StrictMode>,
)
