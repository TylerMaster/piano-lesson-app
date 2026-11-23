import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const USER_ID_KEY = 'auth_user_id';

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

export async function saveUserId(userId: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
  } catch (err) {
    throw new StorageError(err);
  }
}

export async function getUserId(): Promise<number | null> {
  try {
    const val = await SecureStore.getItemAsync(USER_ID_KEY);
    if (val === null) return null;
    const n = Number(val);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch (err) {
    throw new StorageError(err);
  }
}

export async function clearUserId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(USER_ID_KEY);
  } catch (err) {
    throw new StorageError(err);
  }
}
