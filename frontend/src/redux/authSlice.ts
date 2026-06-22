import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  rating: number;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const storedToken = localStorage.getItem('chess_token');
const storedUser = localStorage.getItem('chess_user');

const initialState: AuthState = {
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) : null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      localStorage.setItem('chess_token', action.payload.token);
      localStorage.setItem('chess_user', JSON.stringify(action.payload.user));
    },
    updateRating(state, action: PayloadAction<number>) {
      if (state.user) {
        state.user = { ...state.user, rating: action.payload };
        localStorage.setItem('chess_user', JSON.stringify(state.user));
      }
    },
    logout(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('chess_token');
      localStorage.removeItem('chess_user');
    },
  },
});

export const { setCredentials, updateRating, logout } = authSlice.actions;
export default authSlice.reducer;
