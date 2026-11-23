import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiError } from '../api';
import { StorageError } from './authStorage';
import { COLORS } from '../constants/theme';
import { useAuth } from './AuthContext';

interface Props {
  onNavigateToRegister: () => void;
  onNavigateToForgotPassword: () => void;
}

export default function LoginScreen({ onNavigateToRegister, onNavigateToForgotPassword }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      // On success, AuthGate sees the new token and renders the main app.
    } catch (err) {
      if (err instanceof StorageError) {
        setError('Could not save your session. Secure storage is unavailable on this device.');
      } else if (err instanceof ApiError) {
        setError(
          err.status === 400 || err.status === 401
            ? 'Incorrect email or password.'
            : `Something went wrong (${err.status}). Please try again.`,
        );
      } else {
        setError('Could not reach the server. Check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.appTitle}>Piano Lesson</Text>
            <Text style={styles.appTitleAccent}>Companion</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Sign in</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                placeholder="••••••••"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {error !== null && (
              <Text style={styles.error}>{error}</Text>
            )}

            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={onNavigateToForgotPassword}
            activeOpacity={0.7}
          >
            <Text style={styles.switchText}>
              <Text style={styles.switchTextAccent}>Forgot password?</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={onNavigateToRegister}
            activeOpacity={0.7}
          >
            <Text style={styles.switchText}>
              Don't have an account?{' '}
              <Text style={styles.switchTextAccent}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 48,
  },
  appTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  appTitleAccent: {
    fontSize: 36,
    fontWeight: '300',
    color: COLORS.accent,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    gap: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  error: {
    fontSize: 14,
    color: '#E05C5C',
    lineHeight: 20,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
    letterSpacing: 0.3,
  },
  switchLink: {
    alignItems: 'center',
    paddingTop: 32,
  },
  switchText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  switchTextAccent: {
    color: COLORS.accent,
    fontWeight: '600',
  },
});
