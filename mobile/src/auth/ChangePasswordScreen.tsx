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
import { COLORS } from '../constants/theme';
import { useAuth } from './AuthContext';
import { changePassword as apiChangePassword } from './authApi';

interface Props {
  onBack: () => void;
}

export default function ChangePasswordScreen({ onBack }: Props) {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiChangePassword(token!, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSucceeded(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          // The backend returns the specific reason in err.message.
          setError(err.message);
        } else {
          setError(`Something went wrong (${err.status}). Please try again.`);
        }
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.form}>
            <Text style={styles.formTitle}>Change password</Text>

            {succeeded ? (
              <View style={styles.successBlock}>
                <Text style={styles.successText}>
                  Your password has been changed.
                </Text>
                <TouchableOpacity
                  style={styles.button}
                  onPress={onBack}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Current password</Text>
                  <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={(text) => { setCurrentPassword(text); setError(null); }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>New password</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={(text) => { setNewPassword(text); setError(null); }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm new password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    placeholder="••••••••"
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
                    {isSubmitting ? 'Saving…' : 'Change password'}
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
});
