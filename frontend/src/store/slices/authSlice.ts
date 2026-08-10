import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import * as authApi from '../../services/authService';
import type { LoginRequest } from '../../types';

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  role: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: !!localStorage.getItem('access_token'),
  username: localStorage.getItem('username'),
  role: localStorage.getItem('role'),
  loading: false,
  error: null,
};

export const login = createAsyncThunk(
  'auth/login',
  async (data: LoginRequest, { rejectWithValue }) => {
    try {
      const res = await authApi.login(data);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('username', res.username);
      localStorage.setItem('role', res.role);
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return rejectWithValue(message);
    }
  }
);

export const googleLogin = createAsyncThunk(
  'auth/googleLogin',
  async (credential: string, { rejectWithValue }) => {
    try {
      const res = await authApi.googleLogin(credential);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('username', res.username);
      localStorage.setItem('role', res.role);
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google login failed';
      return rejectWithValue(message);
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
      state.isAuthenticated = false;
      state.username = null;
      state.role = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action: PayloadAction<{ username: string; role: string; access_token: string }>) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.username = action.payload.username;
        state.role = action.payload.role;
      })
      .addCase(login.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; })
      .addCase(googleLogin.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(googleLogin.fulfilled, (state, action: PayloadAction<{ username: string; role: string; access_token: string }>) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.username = action.payload.username;
        state.role = action.payload.role;
      })
      .addCase(googleLogin.rejected, (state, action) => { state.loading = false; state.error = action.payload as string; });
  },
});

export const { logout, clearError, setError } = authSlice.actions;
export default authSlice.reducer;
