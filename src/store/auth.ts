import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  init: () => Promise<void>;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  init: async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      set({ user: data.user ?? null, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
  login: (user) => {
    set({ user, ready: true });
  },
  logout: async () => {
    set({ user: null, ready: true });
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // Best-effort logout even if the network request fails.
    }
  },
}));
