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
import { COLORS } from '../constants/theme';
import { forgotPassword as apiForgotPassword } from './authApi';

interface Props {
  onBack: () => void;
  onNavigateToResetPassword: () => void;
}

export default function ForgotPasswordScreen({ onBack, onNavigateToResetPassword }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiForgotPassword(email.trim());
      setSubmitted(true);
    } catch {
      // Network errors or unexpected server errors.
      // We do not distinguish "email not found" from success here — the backend
      // returns the same 200 response either way to prevent account enumeration.
      setError('Could not reach the server. Check your connection and try again.');
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Forgot password</Text>

            {submitted ? (
              <View style={styles.successBlock}>
                <Text style={styles.successText}>
                  If that email address is registered, you will receive a password reset email
                  shortly.
                </Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={onNavigateToResetPassword}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Enter reset code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onBack}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.description}>
                  Enter your email address and we will send you a password reset code.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(text) => { setEmail(text); setError(null); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                {error !== null && (
                  <Text style={styles.error}>{error}</Text>
                )}

                <TouchableOpacity
                  style={[styles.button, isSubmitting && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>
                    {isSubmitting ? 'Sending…' : 'Send reset code'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
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
    paddingTop: 24,
    paddingBottom: 48,
  },
  backButton: {
    marginBottom: 32,
  },
  backButtonText: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: '500',
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
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
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
  successBlock: {
    gap: 20,
  },
  successText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  secondaryButton: {
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
});
