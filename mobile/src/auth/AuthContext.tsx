import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  clearEmail,
  clearToken,
  clearUserId,
  getEmail,
  getToken,
  getUserId,
  saveEmail,
  saveToken,
  saveUserId,
} from './authStorage';
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

  // On mount, restore the token and userId persisted from the previous session.
  // userId is stored separately in SecureStore alongside the token. If a token
  // exists but userId is missing (e.g. corrupted SecureStore, partial write),
  // the credentials are unusable — clear both and require the user to log in
  // again rather than entering the app with a null userId.
  useEffect(() => {
    Promise.all([getToken(), getUserId(), getEmail()])
      .then(([token, userId, email]) => {
        if (token !== null && userId === null) {
          return Promise.all([clearToken(), clearUserId(), clearEmail()]).then(() => {
            setState({ token: null, userId: null, email: null, isLoading: false });
          });
        }
        setState({ token, userId, email, isLoading: false });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    try {
      await saveToken(data.token);
      await saveUserId(data.userId);
      await saveEmail(data.email);
    } catch (err) {
      await Promise.all([clearToken(), clearUserId(), clearEmail()]).catch(() => {});
      throw err;
    }
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
    try {
      await saveToken(data.token);
      await saveUserId(data.userId);
      await saveEmail(data.email);
    } catch (err) {
      await Promise.all([clearToken(), clearUserId(), clearEmail()]).catch(() => {});
      throw err;
    }
    setState({
      token: data.token,
      userId: data.userId,
      email: data.email,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await Promise.all([clearToken(), clearUserId(), clearEmail()]);
    } catch (err) {
      console.warn('[Auth] Failed to clear stored credentials during logout:', err);
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
