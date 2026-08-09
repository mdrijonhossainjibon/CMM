import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from '../store/slices/authSlice';
import serverReducer from '../store/slices/serverSlice';
import themeReducer from '../store/slices/themeSlice';
import trainingReducer from '../store/slices/trainingSlice';
import detectionReducer from '../store/slices/detectionSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    server: serverReducer,
    theme: themeReducer,
    training: trainingReducer,
    detection: detectionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
