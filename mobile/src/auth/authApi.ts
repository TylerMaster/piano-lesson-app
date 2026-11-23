import { ApiError } from '../api';
import { BACKEND_URL } from '../config';

export interface LoginResponse {
  userId: number;
  email: string;
  token: string;
  tokenType: string;
}

export interface RegisterResponse {
  id: number;
  email: string;
  createdAt: string;
}

// Local mirror of the private expectOk helper in api.ts.
// Extracts the response body as an error message on non-2xx status.
async function expectOk<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.text();
      if (body) detail = body;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(res.status, `HTTP ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return expectOk<LoginResponse>(res);
}

export async function register(
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return expectOk<RegisterResponse>(res);
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  // The backend always returns 200 whether the email is registered or not.
  // A non-2xx here means a network-level or server error, not "email not found".
  if (!res.ok) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // fall back to the generic HTTP status string above
    }
    throw new ApiError(res.status, detail);
  }
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/auth/change-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    // AuthController's @ExceptionHandler returns {"message": "<reason>"}.
    // RFC 7807 Problem Details (if ever enabled) uses "detail" instead.
    // Fall back to a generic string so the value is never empty.
    // res.statusText is not used because React Native's fetch leaves it empty.
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; detail?: string };
      if (body.message) detail = body.message;
      else if (body.detail) detail = body.detail;
    } catch {
      // fall back to the generic HTTP status string above
    }
    throw new ApiError(res.status, detail);
  }
}
