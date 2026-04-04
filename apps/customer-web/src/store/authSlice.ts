import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  customerId: string | null;
  name: string | null;
  phone: string | null;
}

const saved = localStorage.getItem('customer_auth');
const initial: AuthState = saved
  ? (JSON.parse(saved) as AuthState)
  : { token: null, customerId: null, name: null, phone: null };

export const authSlice = createSlice({
  name: 'auth',
  initialState: initial,
  reducers: {
    setAuth(state, action: PayloadAction<AuthState>) {
      state.token = action.payload.token;
      state.customerId = action.payload.customerId;
      state.name = action.payload.name;
      state.phone = action.payload.phone;
      localStorage.setItem('customer_auth', JSON.stringify(action.payload));
    },
    setName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      const saved = localStorage.getItem('customer_auth');
      if (saved) {
        const parsed = JSON.parse(saved) as AuthState;
        parsed.name = action.payload;
        localStorage.setItem('customer_auth', JSON.stringify(parsed));
      }
    },
    clearAuth(state) {
      state.token = null;
      state.customerId = null;
      state.name = null;
      state.phone = null;
      localStorage.removeItem('customer_auth');
    }
  }
});

export const { setAuth, setName, clearAuth } = authSlice.actions;
export default authSlice.reducer;
