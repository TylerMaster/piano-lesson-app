import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

type AuthScreen = 'login' | 'register';

interface Props {
  children: React.ReactNode;
}

// Renders auth screens when no token is present, or the main app when signed in.
// Auth screen navigation (login ↔ register) is local to this component and
// completely separate from the main app's screen state.
export default function AuthGate({ children }: Props) {
  const { token, isLoading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');

  useEffect(() => {
    if (!isLoading && !token) {
      setAuthScreen('login');
    }
  }, [token, isLoading]);

  // Hold off rendering while SecureStore resolves the persisted token —
  // avoids a flash of the login screen on startup for returning users.
  if (isLoading) {
    return null;
  }

  if (!token) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen
          onNavigateToLogin={() => setAuthScreen('login')}
        />
      );
    }
    return (
      <LoginScreen
        onNavigateToRegister={() => setAuthScreen('register')}
      />
    );
  }

  return <>{children}</>;
}
