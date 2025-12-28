'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { HardDrive, Files, Download, AppWindow, FolderOpen } from 'lucide-react';

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

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<OverviewStats>({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const { data } = await apiClient.get<OverviewStats>('/admin/analytics/overview');
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Storage Used',
      value: formatBytes(stats?.totalStorage.usedBytes || 0),
      subtitle: `of ${formatBytes(stats?.totalStorage.quotaBytes || 0)} (${(stats?.totalStorage.percentage || 0).toFixed(1)}%)`,
      icon: HardDrive,
      iconBg: 'from-[#ee4f27]/20 to-[#ee4f27]/5',
      iconColor: 'text-[#ee4f27]',
      showProgress: true,
      progressValue: stats?.totalStorage.percentage || 0,
    },
    {
      title: 'Total Files',
      value: (stats?.files.total || 0).toLocaleString(),
      subtitle: `+${stats?.files.uploadedToday || 0} today`,
      icon: Files,
      iconBg: 'from-[#6b21ef]/20 to-[#6b21ef]/5',
      iconColor: 'text-[#6b21ef]',
    },
    {
      title: 'Downloads',
      value: (stats?.downloads.thisMonth || 0).toLocaleString(),
      subtitle: 'this month',
      icon: Download,
      iconBg: 'from-emerald-500/20 to-emerald-500/5',
      iconColor: 'text-emerald-400',
    },
    {
      title: 'Applications',
      value: stats?.applications || 0,
      subtitle: 'active apps',
      icon: AppWindow,
      iconBg: 'from-sky-500/20 to-sky-500/5',
      iconColor: 'text-sky-400',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-[#c4bbd3] mt-1">
          Overview of your storage service
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover:border-white/[0.12] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-[1.02] transition-all duration-300 cursor-default">
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

      {/* Top Buckets */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <CardTitle>Top Buckets by Storage</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {stats?.topBuckets.map((bucket, index) => (
              <div key={bucket.name} className="flex items-center gap-4 group">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-sm font-medium text-[#c4bbd3] group-hover:bg-[#ee4f27]/10 group-hover:text-[#ee4f27] transition-all duration-200">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-white">{bucket.name}</span>
                    <span className="text-sm text-[#c4bbd3]">
                      {formatBytes(bucket.usedBytes)}
                    </span>
                  </div>
                  <Progress
                    value={
                      stats.totalStorage.usedBytes > 0
                        ? (bucket.usedBytes / stats.totalStorage.usedBytes) * 100
                        : 0
                    }
                    className="h-2"
                  />
                </div>
                <span className="text-sm text-[#c4bbd3] w-20 text-right">
                  {bucket.fileCount} files
                </span>
              </div>
            ))}
            {(!stats?.topBuckets || stats.topBuckets.length === 0) && (
              <div className="text-center py-8">
                <FolderOpen className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
                <p className="text-sm text-[#c4bbd3]">
                  No buckets yet. Create your first bucket to get started.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
