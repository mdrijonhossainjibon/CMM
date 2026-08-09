import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const DEFAULT_URL = 'http://localhost:8000/api';

interface ServerState {
  serverUrl: string;
  isConnected: boolean;
}

function getInitialUrl(): string {
  if (import.meta.env.DEV) {
    const stored = localStorage.getItem('server_api_url');
    if (stored) return stored;
    localStorage.setItem('server_api_url', DEFAULT_URL);
    return DEFAULT_URL;
  }
  return localStorage.getItem('server_api_url') || '';
}

const initialState: ServerState = {
  serverUrl: getInitialUrl(),
  isConnected: !!getInitialUrl(),
};

const serverSlice = createSlice({
  name: 'server',
  initialState,
  reducers: {
    setServerUrl(state, action: PayloadAction<string>) {
      const trimmed = action.payload.trim().replace(/\/+$/, '');
      state.serverUrl = trimmed;
      state.isConnected = true;
      localStorage.setItem('server_api_url', trimmed);
    },
    disconnect(state) {
      state.serverUrl = '';
      state.isConnected = false;
      localStorage.removeItem('server_api_url');
    },
  },
});

export const { setServerUrl, disconnect } = serverSlice.actions;
export default serverSlice.reducer;
