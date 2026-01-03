/**
 * LoadingSkeletons - Loading states for analytics components
 */

export const MetricCardSkeleton = () => (
  <div className="glass-card p-6 animate-pulse">
    <div className="h-4 bg-white/10 rounded w-1/2 mb-4"></div>
    <div className="h-8 bg-white/10 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-white/10 rounded w-1/3"></div>
  </div>
);

export const ChartSkeleton = () => (
  <div className="glass-panel p-6 animate-pulse">
    <div className="h-6 bg-white/10 rounded w-1/3 mb-4"></div>
    <div className="h-64 bg-white/10 rounded"></div>
  </div>
);

export const TableSkeleton = () => (
  <div className="glass-panel p-6 animate-pulse">
    <div className="h-6 bg-white/10 rounded w-1/4 mb-4"></div>
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 bg-white/10 rounded"></div>
      ))}
    </div>
  </div>
);

export const PageSkeleton = () => (
  <div className="section-gap">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
    <div className="chart-grid">
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
    <TableSkeleton />
  </div>
);
