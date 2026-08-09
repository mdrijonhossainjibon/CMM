import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/store';
import { login, register, clearError } from '../store/slices/authSlice';

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((state) => state.auth);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearError());
    try {
      if (isRegister) {
        await dispatch(register({ username, password })).unwrap();
      } else {
        await dispatch(login({ username, password })).unwrap();
      }
      navigate('/');
    } catch {
      // error is handled by Redux
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="w-full max-w-sm glass rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-lg font-bold mx-auto mb-3">
            CM
          </div>
          <h1 className="text-xl font-semibold text-dark-heading">
            {isRegister ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-dark-text mt-1">
            {isRegister ? 'Register a new account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-dark-text mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-dark-text mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary transition-colors"
              required
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-dark-text mt-6">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); dispatch(clearError()); }}
            className="text-primary hover:underline"
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>

        <div className="mt-4 p-3 rounded-lg bg-dark-surface border border-dark-border">
          <p className="text-[10px] text-dark-text text-center">Default: admin / admin123</p>
        </div>
      </div>
    </div>
  );
}
