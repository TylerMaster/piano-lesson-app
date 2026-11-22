import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

export class StorageError extends Error {
  constructor(cause: unknown) {
    super('Secure storage is unavailable on this device.');
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (err) {
    throw new StorageError(err);
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (err) {
    throw new StorageError(err);
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (err) {
    throw new StorageError(err);
  }
}
