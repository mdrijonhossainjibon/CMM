import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
}

const initialState: ThemeState = {
  theme: (localStorage.getItem('theme') as Theme) || 'dark',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', state.theme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(state.theme);
      document.documentElement.setAttribute('data-theme', state.theme);
    },
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      localStorage.setItem('theme', state.theme);
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(state.theme);
      document.documentElement.setAttribute('data-theme', state.theme);
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;
export default themeSlice.reducer;
