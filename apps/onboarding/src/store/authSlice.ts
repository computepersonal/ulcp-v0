import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface StaffUser {
  user_id: string;
  tenant_id: string | null;
  role: string;
  name: string;
  email: string;
  permissions: string[];
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: StaffUser | null;
  onboardingCompleted: boolean | null; // null = not yet checked, true/false = known
  onboardingStep: number;
}

const saved = localStorage.getItem('staff_auth');
const initial: AuthState = saved
  ? (JSON.parse(saved) as AuthState)
  : { token: null, refreshToken: null, user: null, onboardingCompleted: null, onboardingStep: 1 };

// Ensure older persisted state has the new fields
if (initial.onboardingCompleted === undefined) initial.onboardingCompleted = null;
if (initial.onboardingStep === undefined) initial.onboardingStep = 1;

export const authSlice = createSlice({
  name: 'auth',
  initialState: initial,
  reducers: {
    setAuth(state, action: PayloadAction<{ token: string; refreshToken?: string; user: StaffUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      if (action.payload.refreshToken) {
        state.refreshToken = action.payload.refreshToken;
      }
      localStorage.setItem('staff_auth', JSON.stringify({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        onboardingCompleted: state.onboardingCompleted,
        onboardingStep: state.onboardingStep,
      }));
    },
    setOnboardingStatus(state, action: PayloadAction<{ completed: boolean; step: number }>) {
      state.onboardingCompleted = action.payload.completed;
      state.onboardingStep = action.payload.step;
      localStorage.setItem('staff_auth', JSON.stringify({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        onboardingCompleted: state.onboardingCompleted,
        onboardingStep: state.onboardingStep,
      }));
    },
    clearAuth(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      state.onboardingCompleted = null;
      state.onboardingStep = 1;
      localStorage.removeItem('staff_auth');
    },
  },
});

export const { setAuth, setOnboardingStatus, clearAuth } = authSlice.actions;
export default authSlice.reducer;
