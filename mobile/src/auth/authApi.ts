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
