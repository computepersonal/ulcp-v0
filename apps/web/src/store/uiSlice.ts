import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface UiState {
  notifications: Notification[];
  sidebarExpanded: boolean;
}

export const uiSlice = createSlice({
  name: 'ui',
  initialState: { notifications: [], sidebarExpanded: false } as UiState,
  reducers: {
    addNotification(
      state,
      action: PayloadAction<{ message: string; type: 'info' | 'success' | 'warning' | 'error' }>
    ) {
      state.notifications.push({ id: Date.now().toString(), ...action.payload });
    },
    removeNotification(state, action: PayloadAction<string>) {
      state.notifications = state.notifications.filter((n) => n.id !== action.payload);
    },
    toggleSidebar(state) {
      state.sidebarExpanded = !state.sidebarExpanded;
    }
  }
});

export const { addNotification, removeNotification, toggleSidebar } = uiSlice.actions;
export default uiSlice.reducer;
