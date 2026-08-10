import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image } from 'antd';
import { useGoogleLogin } from '@react-oauth/google';
import { useAppDispatch, useAppSelector } from '../app/store';
import { login, googleLogin, clearError } from '../store/slices/authSlice';

function GoogleSignInButton() {
  const dispatch = useAppDispatch();
  const { loading } = useAppSelector((state) => state.auth);

  const signIn = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      dispatch(googleLogin(tokenResponse.access_token));
    },
    onError: () => {
      dispatch(login.rejected(new Error('Google sign-in failed'), '', undefined, 'Google sign-in failed'));
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => signIn()}
        disabled={loading}
        className="w-full py-2.5 rounded-xl border border-dark-border bg-dark-bg hover:bg-dark-surface text-dark-heading text-sm font-medium transition-all flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-dark-border" />
        <span className="text-[10px] text-dark-text/40 uppercase font-medium">or</span>
        <div className="flex-1 h-px bg-dark-border" />
      </div>
    </>
  );
}

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated, role } = useAppSelector((state) => state.auth);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const hasGoogleClient = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (isAuthenticated) {
      navigate(role === 'super_admin' ? '/admin' : '/detection', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    dispatch(clearError());
    dispatch(login({ username: identifier.trim(), password }));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-dark-bg px-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="CaptchaMaster"
            preview={false}
            width={56}
            height={56}
            className="rounded-xl mx-auto mb-5 object-contain"
          />
          <h1 className="text-2xl font-bold text-dark-heading tracking-tight">Sign in to CaptchaMaster</h1>
          <p className="text-sm text-dark-text/60 mt-2">Enter your credentials to access your account</p>
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-2xl p-6">
          {hasGoogleClient && <GoogleSignInButton />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-dark-heading mb-1.5">Username</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-heading text-sm placeholder:text-dark-text/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-heading mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-heading text-sm placeholder:text-dark-text/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm shadow-primary/25"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-dark-border">
            <p className="text-[10px] text-dark-text/40 text-center">
              Default: superadmin / superadmin123
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-dark-text/30 mt-6">
          CaptchaMaster AI Trainer v3.0
        </p>
      </div>
    </div>
  );
}
