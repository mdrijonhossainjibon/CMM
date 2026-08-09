import client from './apiClient';
import type { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from '../types';

export async function login(data: LoginRequest): Promise<TokenResponse> {
  const res = await client.post<TokenResponse>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<TokenResponse> {
  const res = await client.post<TokenResponse>('/auth/register', data);
  return res.data;
}

export async function getMe(): Promise<UserResponse> {
  const res = await client.get<UserResponse>('/auth/me');
  return res.data;
}
