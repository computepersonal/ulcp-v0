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
}

const saved = localStorage.getItem('staff_auth');
const initial: AuthState = saved
  ? (JSON.parse(saved) as AuthState)
  : { token: null, refreshToken: null, user: null };

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
      }));
    },
    clearAuth(state) {
      state.token = null;
      state.refreshToken = null;
      state.user = null;
      localStorage.removeItem('staff_auth');
    },
  },
});

export const { setAuth, clearAuth } = authSlice.actions;
export default authSlice.reducer;
