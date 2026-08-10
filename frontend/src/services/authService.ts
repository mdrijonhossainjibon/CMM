import client from './apiClient';
import type { LoginRequest, TokenResponse, UserResponse } from '../types';

export async function login(data: LoginRequest): Promise<TokenResponse> {
  const res = await client.post<TokenResponse>('/auth/login', data);
  return res.data;
}

export async function googleLogin(credential: string): Promise<TokenResponse> {
  const res = await client.post<TokenResponse>('/auth/google', { credential });
  return res.data;
}

export async function getMe(): Promise<UserResponse> {
  const res = await client.get<UserResponse>('/auth/me');
  return res.data;
}
