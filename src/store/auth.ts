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
  user: (() => {
    // Migrate legacy cik_user key to gp_user
    const legacy = localStorage.getItem('cik_user');
    if (legacy) { localStorage.setItem('gp_user', legacy); localStorage.removeItem('cik_user'); }
    return JSON.parse(localStorage.getItem('gp_user') || 'null');
  })(),
  login: (user) => {
    localStorage.setItem('gp_user', JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem('gp_user');
    set({ user: null });
  },
}));
