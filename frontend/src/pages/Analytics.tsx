import GlassPanel from '../components/common/GlassPanel';
import StatCard from '../components/common/StatCard';

export default function Analytics() {
  const stats = [
    { label: 'Total Detections', value: '1,247', icon: 'detection' as const, trend: 'up' as const, trendValue: '+12% this week' },
    { label: 'Avg Confidence', value: '87.3%', icon: 'analytics' as const, trend: 'up' as const, trendValue: '+2.1%' },
    { label: 'Models Used', value: '3', icon: 'models' as const, trend: 'neutral' as const, trendValue: 'No change' },
    { label: 'Processing Time', value: '142ms', icon: 'clock' as const, trend: 'down' as const, trendValue: '-8ms avg' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 sm:gap-6">
        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-3">Detection History</h3>
          <div className="h-48 flex items-center justify-center text-dark-text/40 text-sm">
            Chart area (coming soon)
          </div>
        </GlassPanel>

        <GlassPanel>
          <h3 className="text-sm font-medium text-dark-heading mb-3">Class Distribution</h3>
          <div className="h-48 flex items-center justify-center text-dark-text/40 text-sm">
            Chart area (coming soon)
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <h3 className="text-sm font-medium text-dark-heading mb-3">Recent Activity</h3>
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-[10px] sm:text-xs text-dark-text border-b border-dark-border">
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium hidden xs:table-cell">Type</th>
              <th className="pb-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="text-dark-text">
            <tr className="border-b border-dark-border/50">
              <td className="py-2">2 min ago</td>
              <td className="py-2 hidden xs:table-cell">Batch Detection</td>
              <td className="py-2 text-green-400">3 objects found</td>
            </tr>
            <tr className="border-b border-dark-border/50">
              <td className="py-2">15 min ago</td>
              <td className="py-2 hidden xs:table-cell">Single Detection</td>
              <td className="py-2 text-green-400">1 object found</td>
            </tr>
            <tr>
              <td className="py-2">1 hr ago</td>
              <td className="py-2 hidden xs:table-cell">Model Reload</td>
              <td className="py-2 text-yellow-400">Success</td>
            </tr>
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
