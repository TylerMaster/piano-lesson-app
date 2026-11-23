import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import ResetPasswordScreen from './ResetPasswordScreen';

type AuthScreen = 'login' | 'register' | 'forgot-password' | 'reset-password';

interface Props {
  children: React.ReactNode;
}

// Renders auth screens when no token or userId is present, or the main app
// when fully signed in. Both must be non-null before the app is shown — a
// token without a userId cannot safely reach storage functions.
// Auth screen navigation (login ↔ register) is local to this component and
// completely separate from the main app's screen state.
export default function AuthGate({ children }: Props) {
  const { token, userId, isLoading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');

  useEffect(() => {
    if (!isLoading && (!token || userId === null)) {
      setAuthScreen('login');
    }
  }, [token, userId, isLoading]);

  // Hold off rendering while SecureStore resolves the persisted token —
  // avoids a flash of the login screen on startup for returning users.
  if (isLoading) {
    return null;
  }

  if (!token || userId === null) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen
          onNavigateToLogin={() => setAuthScreen('login')}
        />
      );
    }
    if (authScreen === 'forgot-password') {
      return (
        <ForgotPasswordScreen
          onBack={() => setAuthScreen('login')}
          onNavigateToResetPassword={() => setAuthScreen('reset-password')}
        />
      );
    }
    if (authScreen === 'reset-password') {
      return (
        <ResetPasswordScreen
          onBack={() => setAuthScreen('login')}
        />
      );
    }
    return (
      <LoginScreen
        onNavigateToRegister={() => setAuthScreen('register')}
        onNavigateToForgotPassword={() => setAuthScreen('forgot-password')}
      />
    );
  }

  return <>{children}</>;
}
