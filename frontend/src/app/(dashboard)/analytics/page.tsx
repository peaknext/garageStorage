'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  HardDrive,
  FileUp,
  Download,
  TrendingUp,
  Database,
  Activity,
  BarChart3,
} from 'lucide-react';

interface OverviewStats {
  totalStorage: {
    usedBytes: number;
    quotaBytes: number;
    percentage: number;
  };
  files: {
    total: number;
    uploadedToday: number;
    uploadedThisMonth: number;
  };
  downloads: {
    today: number;
    thisMonth: number;
  };
  applications: number;
  buckets: number;
  topBuckets: Array<{
    name: string;
    usedBytes: number;
    fileCount: number;
  }>;
}

// n8n-inspired color palette
const COLORS = ['#ee4f27', '#6b21ef', '#10b981', '#f59e0b', '#3b82f6'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl bg-[#0e0918]/95 border border-white/[0.1] backdrop-blur-xl p-3 shadow-xl">
        <p className="text-white font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl bg-[#0e0918]/95 border border-white/[0.1] backdrop-blur-xl p-3 shadow-xl">
        <p className="text-white font-medium">{payload[0].name}</p>
        <p className="text-sm text-[#c4bbd3]">{formatBytes(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const { data } = await apiClient.get<OverviewStats>('/admin/analytics/overview');
      return data;
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
        </div>
      </div>
    );
  }

  const stats = data;

  const activityData = [
    { name: 'Today', uploads: stats?.files.uploadedToday || 0, downloads: stats?.downloads.today || 0 },
    { name: 'This Month', uploads: stats?.files.uploadedThisMonth || 0, downloads: stats?.downloads.thisMonth || 0 },
  ];

  const storageDistribution = stats?.topBuckets.map((bucket, index) => ({
    name: bucket.name,
    value: bucket.usedBytes,
    color: COLORS[index % COLORS.length],
  })) || [];

  const statCards = [
    {
      title: 'Total Storage',
      value: formatBytes(stats?.totalStorage.usedBytes || 0),
      subtitle: `of ${formatBytes(stats?.totalStorage.quotaBytes || 0)} used`,
      icon: HardDrive,
      iconBg: 'from-[#ee4f27]/20 to-[#ee4f27]/5',
      iconColor: 'text-[#ee4f27]',
      showProgress: true,
      progressValue: stats?.totalStorage.percentage || 0,
    },
    {
      title: 'Total Files',
      value: (stats?.files.total || 0).toLocaleString(),
      subtitle: `Across ${stats?.buckets || 0} buckets`,
      icon: Database,
      iconBg: 'from-[#6b21ef]/20 to-[#6b21ef]/5',
      iconColor: 'text-[#6b21ef]',
    },
    {
      title: 'Uploads Today',
      value: (stats?.files.uploadedToday || 0).toLocaleString(),
      subtitle: `${stats?.files.uploadedThisMonth || 0} this month`,
      icon: FileUp,
      iconBg: 'from-emerald-500/20 to-emerald-500/5',
      iconColor: 'text-emerald-400',
    },
    {
      title: 'Downloads Today',
      value: (stats?.downloads.today || 0).toLocaleString(),
      subtitle: `${stats?.downloads.thisMonth || 0} this month`,
      icon: Download,
      iconBg: 'from-sky-500/20 to-sky-500/5',
      iconColor: 'text-sky-400',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Analytics</h1>
        <p className="text-[#c4bbd3] mt-1">
          Monitor storage usage and file activity
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover:border-white/[0.12] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-[1.02] transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-medium text-[#c4bbd3]">
                {stat.title}
              </CardTitle>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.iconBg} border border-white/[0.08]`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white tracking-tight">
                {stat.value}
              </div>
              <p className="text-sm text-[#c4bbd3]/70 mt-1">
                {stat.subtitle}
              </p>
              {stat.showProgress && (
                <Progress
                  value={stat.progressValue}
                  className="mt-3 h-2"
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
                <Activity className="h-5 w-5 text-[#ee4f27]" />
              </div>
              <div>
                <CardTitle>Upload & Download Activity</CardTitle>
                <CardDescription>File operations comparison</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="#c4bbd3" fontSize={12} />
                  <YAxis stroke="#c4bbd3" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="uploads" fill="#ee4f27" name="Uploads" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="downloads" fill="#6b21ef" name="Downloads" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#ee4f27]" />
                <span className="text-sm text-[#c4bbd3]">Uploads</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#6b21ef]" />
                <span className="text-sm text-[#c4bbd3]">Downloads</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                <TrendingUp className="h-5 w-5 text-[#6b21ef]" />
              </div>
              <div>
                <CardTitle>Storage Distribution</CardTitle>
                <CardDescription>Top buckets by storage usage</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {storageDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={storageDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {storageDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center">
                  <BarChart3 className="h-12 w-12 text-[#c4bbd3]/30 mb-3" />
                  <p className="text-[#c4bbd3]">No bucket data available</p>
                </div>
              )}
            </div>
            {storageDistribution.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
                {storageDistribution.map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-[#c4bbd3]">{entry.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Buckets Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-white/[0.08]">
              <Database className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle>Top Buckets by Storage</CardTitle>
              <CardDescription>Buckets consuming the most storage space</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.topBuckets && stats.topBuckets.length > 0 ? (
            <div className="space-y-5">
              {stats.topBuckets.map((bucket, index) => (
                <div key={bucket.name} className="flex items-center gap-4 group">
                  <div
                    className="h-4 w-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white truncate">{bucket.name}</span>
                      <span className="text-sm text-[#c4bbd3] ml-4">
                        {formatBytes(bucket.usedBytes)}
                      </span>
                    </div>
                    <Progress
                      value={
                        stats.totalStorage.usedBytes
                          ? (bucket.usedBytes / stats.totalStorage.usedBytes) * 100
                          : 0
                      }
                      className="h-2"
                    />
                    <div className="mt-2 flex items-center justify-between text-sm text-[#c4bbd3]/70">
                      <span>{bucket.fileCount} files</span>
                      <span>
                        {stats.totalStorage.usedBytes
                          ? ((bucket.usedBytes / stats.totalStorage.usedBytes) * 100).toFixed(1)
                          : 0}% of total
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Database className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No buckets found. Create your first bucket to see analytics.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
