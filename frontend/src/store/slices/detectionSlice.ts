import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DetectionObject } from '../../types';

interface DetectionState {
  lastDetections: DetectionObject[];
  lastCount: number;
}

const initialState: DetectionState = {
  lastDetections: [],
  lastCount: 0,
};

const detectionSlice = createSlice({
  name: 'detection',
  initialState,
  reducers: {
    setLastDetections(state, action: PayloadAction<DetectionObject[]>) {
      state.lastDetections = action.payload;
      state.lastCount = action.payload.length;
    },
    clearDetections(state) {
      state.lastDetections = [];
      state.lastCount = 0;
    },
  },
});

export const { setLastDetections, clearDetections } = detectionSlice.actions;
export default detectionSlice.reducer;
