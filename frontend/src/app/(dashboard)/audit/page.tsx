'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  ScrollText,
  Search,
  Download,
  Clock,
  User,
  Activity,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AuditLog {
  id: string;
  actorType: 'ADMIN_USER' | 'APPLICATION' | 'SYSTEM';
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  previousValue: any;
  newValue: any;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage: string | null;
  metadata: any;
  createdAt: string;
}

interface AuditLogsResponse {
  data: AuditLog[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  byActorType: Record<string, number>;
  byStatus: Record<string, number>;
  recentActivity: { date: string; count: number }[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  UPDATE: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
  LOGIN: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  UPLOAD: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  DOWNLOAD: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [actorType, setActorType] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const limit = 25;

  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditStats>('/admin/audit/stats');
      return data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, limit, search, actorType, action, resourceType, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit };
      if (search) params.search = search;
      if (actorType) params.actorType = actorType;
      if (action) params.action = action;
      if (resourceType) params.resourceType = resourceType;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const { data } = await apiClient.get<AuditLogsResponse>('/admin/audit', { params });
      return data;
    },
  });

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (action) params.set('action', action);
    if (resourceType) params.set('resourceType', resourceType);

    const token = localStorage.getItem('accessToken');
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9001/api/v1'}/admin/audit/export?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getActionColor = (action: string) => {
    const prefix = action.split('_')[0];
    return ACTION_COLORS[prefix] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const getActorIcon = (actorType: string) => {
    switch (actorType) {
      case 'ADMIN_USER':
        return <User className="h-4 w-4" />;
      case 'APPLICATION':
        return <Activity className="h-4 w-4" />;
      case 'SYSTEM':
        return <Clock className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
            <ScrollText className="h-7 w-7 text-[#6b21ef]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Audit Logs</h1>
            <p className="text-[#c4bbd3]">Track all system operations and changes</p>
          </div>
        </div>
        <Button
          onClick={handleExport}
          className="bg-[#6b21ef] hover:bg-[#5a1bcf] text-white"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-white/[0.02] border-white/[0.08]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6b21ef]/20">
                  <ScrollText className="h-5 w-5 text-[#6b21ef]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{(statsData.total ?? 0).toLocaleString()}</p>
                  <p className="text-sm text-[#c4bbd3]">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/[0.02] border-white/[0.08]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{(statsData.byStatus?.SUCCESS || 0).toLocaleString()}</p>
                  <p className="text-sm text-[#c4bbd3]">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/[0.02] border-white/[0.08]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{(statsData.byStatus?.FAILURE || 0).toLocaleString()}</p>
                  <p className="text-sm text-[#c4bbd3]">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/[0.02] border-white/[0.08]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                  <Activity className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">
                    {Object.keys(statsData.byAction || {}).length}
                  </p>
                  <p className="text-sm text-[#c4bbd3]">Action Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="bg-white/[0.02] border-white/[0.08]">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c4bbd3]/60" />
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-11"
              />
            </div>
            <Select value={actorType} onValueChange={(v) => { setActorType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Actor Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="ADMIN_USER">Admin User</SelectItem>
                <SelectItem value="APPLICATION">Application</SelectItem>
                <SelectItem value="SYSTEM">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={resourceType} onValueChange={(v) => { setResourceType(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Resource Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                <SelectItem value="FILE">File</SelectItem>
                <SelectItem value="BUCKET">Bucket</SelectItem>
                <SelectItem value="APPLICATION">Application</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="POLICY">Policy</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-[160px]"
              placeholder="Start Date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-[160px]"
              placeholder="End Date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <ScrollText className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                {data?.meta.total || 0} events found
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : data?.data.length === 0 ? (
            <div className="py-12 text-center">
              <ScrollText className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No audit logs found</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Adjust your filters or check back later
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.data.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.04] transition-all"
                >
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        log.status === 'SUCCESS' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                      }`}>
                        {log.status === 'SUCCESS' ? (
                          <CheckCircle className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                          <span className="text-xs text-[#c4bbd3]/60">{log.resourceType}</span>
                          {log.resourceName && (
                            <span className="text-sm text-white truncate">{log.resourceName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#c4bbd3]/60">
                          <span className="flex items-center gap-1">
                            {getActorIcon(log.actorType)}
                            {log.actorEmail || log.actorType}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(log.createdAt)}
                          </span>
                          {log.ipAddress && (
                            <span>{log.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      {expandedLog === log.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {expandedLog === log.id && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-[#c4bbd3]/60 mb-1">Request</p>
                          <code className="text-xs text-white bg-black/30 px-2 py-1 rounded">
                            {log.requestMethod} {log.requestPath}
                          </code>
                        </div>
                        <div>
                          <p className="text-[#c4bbd3]/60 mb-1">Resource ID</p>
                          <code className="text-xs text-white bg-black/30 px-2 py-1 rounded">
                            {log.resourceId || 'N/A'}
                          </code>
                        </div>
                      </div>
                      {log.errorMessage && (
                        <div>
                          <p className="text-[#c4bbd3]/60 mb-1 text-sm">Error</p>
                          <p className="text-sm text-red-400">{log.errorMessage}</p>
                        </div>
                      )}
                      {(log.previousValue || log.newValue) && (
                        <div className="grid grid-cols-2 gap-4">
                          {log.previousValue && (
                            <div>
                              <p className="text-[#c4bbd3]/60 mb-1 text-sm">Previous Value</p>
                              <pre className="text-xs text-white bg-black/30 p-2 rounded overflow-auto max-h-32">
                                {JSON.stringify(log.previousValue, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.newValue && (
                            <div>
                              <p className="text-[#c4bbd3]/60 mb-1 text-sm">New Value</p>
                              <pre className="text-xs text-white bg-black/30 p-2 rounded overflow-auto max-h-32">
                                {JSON.stringify(log.newValue, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                      {log.userAgent && (
                        <div>
                          <p className="text-[#c4bbd3]/60 mb-1 text-sm">User Agent</p>
                          <p className="text-xs text-[#c4bbd3] truncate">{log.userAgent}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-[#c4bbd3]">
                Page {page} of {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
