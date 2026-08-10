import { useState, useEffect, useCallback } from 'react';
import GlassPanel from '../components/common/GlassPanel';
import { Icon } from '../components/common/Icons';
import { settingsService, type R2Stats } from '../services/settingsService';
import toast from 'react-hot-toast';

export default function Settings() {
  const [r2Enabled, setR2Enabled] = useState(false);
  const [r2Endpoint, setR2Endpoint] = useState('');
  const [r2AccessKey, setR2AccessKey] = useState('');
  const [r2SecretKey, setR2SecretKey] = useState('');
  const [r2Bucket, setR2Bucket] = useState('captchamaster');
  const [r2Region, setR2Region] = useState('auto');
  const [r2Saving, setR2Saving] = useState(false);
  const [r2Testing, setR2Testing] = useState(false);
  const [r2Status, setR2Status] = useState<'idle' | 'connected' | 'error'>('idle');
  const [r2Stats, setR2Stats] = useState<R2Stats | null>(null);
  const [r2StatsLoading, setR2StatsLoading] = useState(false);

  const loadR2Config = useCallback(async () => {
    try {
      const config = await settingsService.getR2Config();
      setR2Enabled(config.r2_enabled);
      setR2Endpoint(config.r2_endpoint_url);
      setR2AccessKey(config.r2_access_key_id);
      setR2Bucket(config.r2_bucket_name);
      setR2Region(config.r2_region);
      if (config.r2_enabled && config.r2_endpoint_url) {
        setR2Status('connected');
        fetchR2Usage();
      }
    } catch {
      // R2 config load failed - server may not be reachable
    }
  }, []);

  const fetchR2Usage = async () => {
    setR2StatsLoading(true);
    try {
      const status = await settingsService.getR2Status();
      if (status.configured) {
        setR2Stats(status.stats);
      }
    } catch {
      setR2Stats(null);
    } finally {
      setR2StatsLoading(false);
    }
  };

  useEffect(() => {
    loadR2Config();
  }, [loadR2Config]);

  const handleR2Save = async () => {
    setR2Saving(true);
    try {
      const res = await settingsService.saveR2Config({
        r2_enabled: r2Enabled,
        r2_endpoint_url: r2Endpoint,
        r2_access_key_id: r2AccessKey,
        r2_secret_access_key: r2SecretKey,
        r2_bucket_name: r2Bucket,
        r2_region: r2Region,
      });
      if (res.success) {
        toast.success('R2 configuration saved to server');
        setR2Status(r2Enabled ? 'connected' : 'idle');
        setR2SecretKey('');
        if (r2Enabled) fetchR2Usage();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save R2 configuration');
    } finally {
      setR2Saving(false);
    }
  };

  const handleR2Test = async () => {
    if (!r2Endpoint || !r2AccessKey || !r2SecretKey) {
      toast.error('Fill in endpoint, access key, and secret key first');
      return;
    }
    setR2Testing(true);
    try {
      const res = await settingsService.testR2Connection({
        r2_endpoint_url: r2Endpoint,
        r2_access_key_id: r2AccessKey,
        r2_secret_access_key: r2SecretKey,
        r2_bucket_name: r2Bucket,
        r2_region: r2Region,
      });
      if (res.success) {
        toast.success(res.message || 'Connection successful!');
        setR2Status('connected');
        fetchR2Usage();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Connection test failed');
      setR2Status('error');
    } finally {
      setR2Testing(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassPanel>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-dark-heading">Cloudflare R2 Storage</h2>
                <p className="text-xs text-dark-text mt-0.5">
                  Backup training data & models to Cloudflare R2 (S3-compatible)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`w-2 h-2 rounded-full ${r2Status === 'connected' ? 'bg-green-400' : r2Status === 'error' ? 'bg-red-400' : 'bg-dark-border'}`} />
                <span className="text-xs text-dark-text">
                  {r2Status === 'connected' ? 'Connected' : r2Status === 'error' ? 'Error' : 'Not configured'}
                </span>
              </div>
            </div>

            {r2Status === 'connected' && r2Stats && (
              <div className="mb-4 p-3 rounded-lg bg-dark-surface border border-dark-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-dark-heading">Storage Usage</h4>
                  <button
                    onClick={fetchR2Usage}
                    disabled={r2StatsLoading}
                    className="text-[10px] text-dark-text hover:text-dark-heading transition-colors"
                  >
                    {r2StatsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-dark-text">Used</span>
                    <span className="text-dark-heading font-medium">{(r2Stats.total_size_gb ?? r2Stats.total_size_mb / 1024).toFixed(2)} GB</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-dark-text">Objects</span>
                    <span className="text-dark-heading">{r2Stats.objects} files</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-dark-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(((r2Stats.total_size_gb ?? r2Stats.total_size_mb / 1024) / 10) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-dark-text/60">
                    Free tier: 10 GB/month · {Math.max(10 - (r2Stats.total_size_gb ?? r2Stats.total_size_mb / 1024), 0).toFixed(1)} GB remaining
                  </p>
                </div>
                {r2Stats.by_prefix && Object.keys(r2Stats.by_prefix).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-dark-border">
                    <p className="text-[10px] text-dark-text/60 mb-1">Breakdown by folder</p>
                    <div className="space-y-0.5">
                      {Object.entries(r2Stats.by_prefix).map(([prefix, data]) => (
                        <div key={prefix} className="flex justify-between text-[11px]">
                          <span className="text-dark-text">/{prefix}/</span>
                          <span className="text-dark-heading">{data.objects} files · {data.size_mb} MB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-dark-surface/50 border border-dark-border rounded-lg p-3 mb-4">
              <h3 className="text-xs font-semibold text-dark-heading mb-2">Credentials kothay paben?</h3>
              <ol className="text-xs text-dark-text space-y-1 list-decimal list-inside">
                <li><a href="https://dash.cloudflare.com" target="_blank" className="text-primary hover:underline">dash.cloudflare.com</a> → login → left sidebar e <strong>R2</strong></li>
                <li><strong>Create Bucket</strong> → bucket name (e.g. <code className="text-primary bg-dark-surface px-1 rounded">captchamaster</code>)</li>
                <li>Top right → <strong>Manage R2 API Tokens</strong> → <strong>Create API Token</strong></li>
                <li>Permission: <strong>Object Read & Write</strong> → Create</li>
                <li><strong>Access Key ID</strong> + <strong>Secret Access Key</strong> copy koren (Secret ekbar e dekhabe!)</li>
                <li><strong>Endpoint URL:</strong> <code className="text-primary bg-dark-surface px-1 rounded">https://&lt;account-id&gt;.r2.cloudflarestorage.com</code></li>
                <li>Account ID: R2 page er URL theke → <code className="text-primary bg-dark-surface px-1 rounded">dash.cloudflare.com/###/r2</code></li>
              </ol>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-1">
                <label className="text-sm text-dark-heading">Enable R2 Storage</label>
                <button
                  onClick={() => setR2Enabled(!r2Enabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    r2Enabled ? 'bg-primary' : 'bg-dark-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      r2Enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm text-dark-heading mb-1">Endpoint URL</label>
                <input
                  type="text"
                  value={r2Endpoint}
                  onChange={(e) => setR2Endpoint(e.target.value)}
                  placeholder="https://<account-id>.r2.cloudflarestorage.com"
                  className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-heading mb-1">Access Key ID</label>
                  <input
                    type="text"
                    value={r2AccessKey}
                    onChange={(e) => setR2AccessKey(e.target.value)}
                    placeholder="R2 API Token → Access Key ID"
                    className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-heading mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    value={r2SecretKey}
                    onChange={(e) => setR2SecretKey(e.target.value)}
                    placeholder="R2 API Token → Secret Key"
                    className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-heading mb-1">Bucket Name</label>
                  <input
                    type="text"
                    value={r2Bucket}
                    onChange={(e) => setR2Bucket(e.target.value)}
                    placeholder="captchamaster"
                    className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-heading mb-1">Region</label>
                  <input
                    type="text"
                    value={r2Region}
                    onChange={(e) => setR2Region(e.target.value)}
                    placeholder="auto"
                    className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleR2Save}
                  disabled={r2Saving}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {r2Saving ? 'Saving...' : 'Save R2 Config'}
                </button>
                <button
                  onClick={handleR2Test}
                  disabled={r2Testing}
                  className="px-4 py-2 rounded-lg bg-dark-surface border border-dark-border text-dark-text text-sm hover:bg-dark-surface/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Icon name="wifi" className="w-4 h-4" />
                  {r2Testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              <div className="border-t border-dark-border pt-3 mt-2">
                <p className="text-xs text-dark-text">
                  Training complete hole model auto R2 te upload hoy. Data Sync er jonno{' '}
                  <code className="text-primary bg-dark-surface px-1 py-0.5 rounded text-xs">POST /api/r2/push/training-data</code>{' '}
                  and <code className="text-primary bg-dark-surface px-1 py-0.5 rounded text-xs">POST /api/r2/pull/training-data</code> use korte paren.
                </p>
              </div>
            </div>
          </GlassPanel>
    </div>
  );
}
