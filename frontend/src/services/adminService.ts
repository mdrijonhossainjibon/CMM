import client from './apiClient';
import type {
  AdminUsersResponse,
  AdminStatsResponse,
  AdminGpuResponse,
  AdminStorageResponse,
} from '../types';

export async function getUsers(): Promise<AdminUsersResponse> {
  const res = await client.get<AdminUsersResponse>('/admin/users', {
    timeout: 10000,
  });
  return res.data;
}

export async function createAdmin(username: string, password: string) {
  const res = await client.post('/auth/admin/create', { username, password, role: 'admin' }, {
    timeout: 10000,
  });
  return res.data;
}

export async function deleteAdmin(username: string) {
  const res = await client.delete('/auth/admin/user', {
    params: { username },
    timeout: 10000,
  });
  return res.data;
}

export async function getStats(): Promise<AdminStatsResponse> {
  const res = await client.get<AdminStatsResponse>('/admin/stats', {
    timeout: 10000,
  });
  return res.data;
}

export async function getGpuStatus(): Promise<AdminGpuResponse> {
  const res = await client.get<AdminGpuResponse>('/admin/gpu', {
    timeout: 10000,
  });
  return res.data;
}

export async function getStorageStatus(): Promise<AdminStorageResponse> {
  const res = await client.get<AdminStorageResponse>('/admin/storage', {
    timeout: 10000,
  });
  return res.data;
}
