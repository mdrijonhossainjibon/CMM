import client from './apiClient';

export interface CollectionInfo {
  collection: string;
  count: number;
}

export interface TransferSummary {
  collection: string;
  transferred: number;
}

export async function getLocalCollections(): Promise<{ collections: CollectionInfo[]; db_name: string }> {
  const res = await client.get('/migrate/collections', { timeout: 10000 });
  return res.data;
}

export async function testAtlasConnection(uri: string): Promise<{ success: boolean; message?: string }> {
  const res = await client.post('/migrate/test', { atlas_uri: uri }, { timeout: 15000 });
  return res.data;
}

export async function transferToAtlas(body: {
  atlas_uri: string;
  db_name?: string;
  collections?: string[];
  drop_first?: boolean;
}): Promise<{ success: boolean; message?: string; summary?: TransferSummary[] }> {
  const res = await client.post('/migrate/transfer', body, { timeout: 300000 });
  return res.data;
}
