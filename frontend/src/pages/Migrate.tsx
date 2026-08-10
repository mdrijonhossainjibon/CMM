import { useState, useEffect, useCallback } from 'react';
import { Select } from 'antd';
import GlassPanel from '../components/common/GlassPanel';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import Modal from '../components/common/Modal';
import { Icon } from '../components/common/Icons';
import {
  getLocalCollections,
  testAtlasConnection,
  transferToAtlas,
  type CollectionInfo,
  type TransferSummary,
} from '../services/migrateService';
import toast from 'react-hot-toast';

export default function Migrate() {
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [dbName, setDbName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [atlasUri, setAtlasUri] = useState('');
  const [targetDb, setTargetDb] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dropFirst, setDropFirst] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<TransferSummary[] | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getLocalCollections();
      setCollections(res.collections);
      setDbName(res.db_name);
      setTargetDb(res.db_name);
      setSelected(res.collections.map((c) => c.collection));
    } catch {
      setError('Failed to load local collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTest = async () => {
    if (!atlasUri.trim()) {
      toast.error('Enter Atlas connection string first');
      return;
    }
    setTesting(true);
    try {
      const res = await testAtlasConnection(atlasUri.trim());
      if (res.success) {
        setTested(true);
        toast.success(res.message || 'Connected!');
      }
    } catch (e: any) {
      setTested(false);
      toast.error(e?.message || 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const handleTransfer = async () => {
    if (selected.length === 0) {
      toast.error('Select at least one collection');
      return;
    }
    setConfirmOpen(false);
    setTransferring(true);
    setSummary(null);
    try {
      const res = await transferToAtlas({
        atlas_uri: atlasUri.trim(),
        db_name: targetDb.trim() || undefined,
        collections: selected,
        drop_first: dropFirst,
      });
      if (res.success) {
        setSummary(res.summary || []);
        toast.success(res.message || 'Transfer complete!');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Transfer failed');
    } finally {
      setTransferring(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading local collections..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  const totalDocs = collections.filter((c) => selected.includes(c.collection)).reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <GlassPanel>
        <h2 className="text-base font-semibold text-dark-heading mb-1 flex items-center gap-2">
          <Icon name="database" className="w-5 h-5 text-primary" />
          Local to MongoDB Atlas Transfer
        </h2>
        <p className="text-xs text-dark-text mb-4">
          Local MongoDB theke Atlas e data transfer korun. Colab GPU te train korte chaile Atlas required.
        </p>

        {/* Step 1: Atlas URI */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-dark-heading mb-1.5 font-medium">Step 1 — Atlas Connection String</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={atlasUri}
                onChange={(e) => { setAtlasUri(e.target.value); setTested(false); }}
                placeholder="mongodb+srv://user:pass@cluster.mongodb.net"
                className="flex-1 px-3 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary font-mono text-xs"
              />
              <button
                onClick={handleTest}
                disabled={testing}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 ${
                  tested ? 'bg-success text-white' : 'bg-primary text-white hover:bg-primary-hover'
                }`}
              >
                {tested ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Connected
                  </>
                ) : (
                  <>
                    <Icon name="wifi" className="w-4 h-4" />
                    {testing ? 'Testing...' : 'Test Connection'}
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-dark-text/50 mt-1.5">
              Atlas Dashboard → Database → Connect → Drivers → connection string copy koren
            </p>
          </div>

          {/* Step 2: Target DB */}
          <div>
            <label className="block text-xs text-dark-heading mb-1.5 font-medium">Step 2 — Target Database Name</label>
            <input
              type="text"
              value={targetDb}
              onChange={(e) => setTargetDb(e.target.value)}
              placeholder={dbName}
              className="w-full px-3 py-2.5 rounded-lg bg-dark-surface border border-dark-border text-dark-heading text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-dark-text/50 mt-1.5">
              Blank rakhle Atlas URI theke auto nibe, na hole local db name ({dbName}) use hobe
            </p>
          </div>

          {/* Step 3: Collections */}
          <div>
            <label className="block text-xs text-dark-heading mb-1.5 font-medium">Step 3 — Collections to Transfer</label>
            <Select
              mode="multiple"
              value={selected}
              onChange={(v) => setSelected(v)}
              options={collections.map((c) => ({
                value: c.collection,
                label: `${c.collection} (${c.count})`,
              }))}
              style={{ width: '100%' }}
              placeholder="Select collections..."
              optionFilterProp="label"
            />
            <p className="text-[10px] text-dark-text/50 mt-1.5">
              {selected.length} collection(s) · {totalDocs} total document(s)
            </p>
          </div>

          {/* Options */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dropFirst}
              onChange={(e) => setDropFirst(e.target.checked)}
              className="w-4 h-4 rounded border-dark-border accent-[#2563EB]"
            />
            <span className="text-xs text-dark-text">
              Drop existing data in Atlas first (replace mode)
            </span>
          </label>

          {/* Transfer */}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={transferring || !atlasUri.trim() || selected.length === 0 || !tested}
            className="w-full py-3 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {transferring ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                <Icon name="database" className="w-4 h-4" />
                Transfer {selected.length} Collection(s) to Atlas
              </>
            )}
          </button>
        </div>
      </GlassPanel>

      {/* Result */}
      {summary && (
        <GlassPanel>
          <h3 className="text-sm font-semibold text-dark-heading mb-3 flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-success">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Transfer Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-dark-border text-[10px] uppercase tracking-wider text-dark-text/50">
                  <th className="pb-2 pr-4 font-medium">Collection</th>
                  <th className="pb-2 font-medium">Documents Transferred</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.collection} className="border-b border-dark-border/50">
                    <td className="py-2 pr-4 text-dark-heading font-mono text-xs">{s.collection}</td>
                    <td className="py-2 text-dark-text">{s.transferred}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}

      <Modal open={confirmOpen} onClose={() => !transferring && setConfirmOpen(false)} title="Confirm Transfer" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-dark-text">
            Transfer <span className="text-dark-heading font-medium">{selected.length}</span> collection(s) to Atlas
            {dropFirst ? ' (existing data replace hobe)' : ''}? Eta kichu minute lagte pare.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleTransfer}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-all"
            >
              Transfer Now
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2.5 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
