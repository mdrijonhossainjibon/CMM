import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TrainingStatusResponse } from '../../types';

interface TrainingState {
  status: TrainingStatusResponse | null;
  datasetType: string;
}

const initialState: TrainingState = {
  status: { running: false, status: 'idle', progress: 0 },
  datasetType: 'auto',
};

const trainingSlice = createSlice({
  name: 'training',
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<TrainingStatusResponse>) {
      state.status = action.payload;
    },
    setDatasetType(state, action: PayloadAction<string>) {
      state.datasetType = action.payload;
    },
  },
});

export const { setStatus, setDatasetType } = trainingSlice.actions;
export default trainingSlice.reducer;
