import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { clearToken, getToken, saveToken } from './authStorage';
import {
  login as apiLogin,
  register as apiRegister,
} from './authApi';

interface AuthState {
  token: string | null;
  // userId and email are populated after login/register but not persisted
  // separately. They reset to null on app restart; only the token is kept.
  // Protected API calls only need the token, so this is sufficient for now.
  userId: number | null;
  email: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    email: null,
    isLoading: true,
  });

  // On mount, restore a previously saved token from secure storage.
  // The token is not re-validated here; the first protected API call will
  // fail with 401 if it has expired, at which point the app can log out.
  useEffect(() => {
    getToken()
      .then((token) => {
        setState({ token, userId: null, email: null, isLoading: false });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    await saveToken(data.token);
    setState({
      token: data.token,
      userId: data.userId,
      email: data.email,
      isLoading: false,
    });
  }, []);

  // Registration does not return a token, so log in immediately after
  // so the user lands in the app without a second action.
  const register = useCallback(async (email: string, password: string) => {
    await apiRegister(email, password);
    const data = await apiLogin(email, password);
    await saveToken(data.token);
    setState({
      token: data.token,
      userId: data.userId,
      email: data.email,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await clearToken();
    } catch (err) {
      console.warn('[Auth] clearToken failed during logout:', err);
    }
    setState({ token: null, userId: null, email: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
