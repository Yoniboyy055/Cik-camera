import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('gp_user') || 'null'),
  login: (user) => {
    localStorage.setItem('gp_user', JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('gp_user');
    set({ user: null });
  },
}));
