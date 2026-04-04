import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface StaffUser {
  user_id: string;
  tenant_id: string;
  role: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: StaffUser | null;
}

const saved = localStorage.getItem('staff_auth');
const initial: AuthState = saved
  ? (JSON.parse(saved) as AuthState)
  : { token: null, user: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState: initial,
  reducers: {
    setAuth(state, action: PayloadAction<AuthState>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      localStorage.setItem('staff_auth', JSON.stringify(action.payload));
    },
    clearAuth(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('staff_auth');
    }
  }
});

export const { setAuth, clearAuth } = authSlice.actions;
export default authSlice.reducer;
