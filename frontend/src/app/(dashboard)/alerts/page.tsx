'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatBytes } from '@/lib/utils';
import {
  Bell,
  Settings,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Mail,
  Webhook,
  Trash2,
  Send,
  HardDrive,
  TrendingUp,
} from 'lucide-react';

interface QuotaAlert {
  id: string;
  applicationId: string;
  warningThreshold: number;
  criticalThreshold: number;
  notifyEmail: string[];
  notifyWebhook: boolean;
  cooldownMinutes: number;
  lastWarningAt: string | null;
  lastCriticalAt: string | null;
  isActive: boolean;
  currentLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    name: string;
    slug: string;
    usedStorageBytes: number;
    maxStorageBytes: number;
  };
}

interface Application {
  id: string;
  name: string;
  slug: string;
  usedStorageBytes: number;
  maxStorageBytes: number;
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  NORMAL: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    text: 'text-emerald-400',
    icon: <CheckCircle className="h-5 w-5" />,
  },
  WARNING: {
    bg: 'bg-amber-500/10 border-amber-500/20',
    text: 'text-amber-400',
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  CRITICAL: {
    bg: 'bg-red-500/10 border-red-500/20',
    text: 'text-red-400',
    icon: <AlertCircle className="h-5 w-5" />,
  },
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Form state
  const [warningThreshold, setWarningThreshold] = useState(75);
  const [criticalThreshold, setCriticalThreshold] = useState(90);
  const [notifyEmails, setNotifyEmails] = useState('');
  const [notifyWebhook, setNotifyWebhook] = useState(true);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [isActive, setIsActive] = useState(true);

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['quota-alerts'],
    queryFn: async () => {
      const { data } = await apiClient.get<QuotaAlert[]>('/admin/alerts');
      return data;
    },
  });

  const { data: applications } = useQuery({
    queryKey: ['applications-for-alerts'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Application[] }>('/admin/applications', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (alertData: any) => {
      await apiClient.post(`/admin/alerts/${selectedApp?.id}`, alertData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quota-alerts'] });
      setIsConfigOpen(false);
      setSelectedApp(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (appId: string) => {
      await apiClient.delete(`/admin/alerts/${appId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quota-alerts'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (appId: string) => {
      await apiClient.post(`/admin/alerts/${appId}/test`);
    },
  });

  const openConfigDialog = (app: Application, existingAlert?: QuotaAlert) => {
    setSelectedApp(app);
    if (existingAlert) {
      setWarningThreshold(existingAlert.warningThreshold);
      setCriticalThreshold(existingAlert.criticalThreshold);
      setNotifyEmails(existingAlert.notifyEmail.join(', '));
      setNotifyWebhook(existingAlert.notifyWebhook);
      setCooldownMinutes(existingAlert.cooldownMinutes);
      setIsActive(existingAlert.isActive);
    } else {
      setWarningThreshold(75);
      setCriticalThreshold(90);
      setNotifyEmails('');
      setNotifyWebhook(true);
      setCooldownMinutes(60);
      setIsActive(true);
    }
    setIsConfigOpen(true);
  };

  const handleSave = () => {
    const emailArray = notifyEmails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    saveMutation.mutate({
      warningThreshold,
      criticalThreshold,
      notifyEmail: emailArray,
      notifyWebhook,
      cooldownMinutes,
      isActive,
    });
  };

  const getUsagePercentage = (used: number, max: number) => {
    if (max === 0) return 0;
    return Math.round((used / max) * 100);
  };

  const getUsageLevel = (percentage: number, warning: number, critical: number): 'NORMAL' | 'WARNING' | 'CRITICAL' => {
    if (percentage >= critical) return 'CRITICAL';
    if (percentage >= warning) return 'WARNING';
    return 'NORMAL';
  };

  // Applications without alerts configured
  const unconfiguredApps = applications?.filter(
    (app) => !alerts?.some((alert) => alert.applicationId === app.id)
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
            <Bell className="h-7 w-7 text-[#ee4f27]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Quota Alerts</h1>
            <p className="text-[#c4bbd3]">Configure storage quota notifications</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {alerts?.filter((a) => a.currentLevel === 'NORMAL').length || 0}
                </p>
                <p className="text-sm text-emerald-400">Normal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {alerts?.filter((a) => a.currentLevel === 'WARNING').length || 0}
                </p>
                <p className="text-sm text-amber-400">Warning</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {alerts?.filter((a) => a.currentLevel === 'CRITICAL').length || 0}
                </p>
                <p className="text-sm text-red-400">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configured Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
              <Bell className="h-5 w-5 text-[#ee4f27]" />
            </div>
            <div>
              <CardTitle>Configured Alerts</CardTitle>
              <CardDescription>
                Applications with quota monitoring enabled
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : alerts?.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No quota alerts configured</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Configure alerts for applications below
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts?.map((alert) => {
                const usage = getUsagePercentage(
                  alert.application.usedStorageBytes,
                  alert.application.maxStorageBytes
                );
                const levelStyle = LEVEL_STYLES[alert.currentLevel];

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border transition-all ${
                      alert.isActive
                        ? 'bg-white/[0.02] border-white/[0.08]'
                        : 'bg-white/[0.01] border-white/[0.04] opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${levelStyle.bg} ${levelStyle.text}`}>
                          {levelStyle.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-white">{alert.application.name}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${levelStyle.bg} ${levelStyle.text}`}>
                              {alert.currentLevel}
                            </span>
                            {!alert.isActive && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                                Paused
                              </span>
                            )}
                          </div>

                          {/* Usage Bar */}
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-[#c4bbd3]/60 mb-1">
                              <span>{formatBytes(alert.application.usedStorageBytes)} used</span>
                              <span>{usage}% of {formatBytes(alert.application.maxStorageBytes)}</span>
                            </div>
                            <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  usage >= alert.criticalThreshold
                                    ? 'bg-red-500'
                                    : usage >= alert.warningThreshold
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(usage, 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-[#c4bbd3]/40 mt-1">
                              <span>Warning: {alert.warningThreshold}%</span>
                              <span>Critical: {alert.criticalThreshold}%</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs text-[#c4bbd3]/60">
                            {alert.notifyEmail.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {alert.notifyEmail.length} email{alert.notifyEmail.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {alert.notifyWebhook && (
                              <span className="flex items-center gap-1">
                                <Webhook className="h-3 w-3" />
                                Webhook enabled
                              </span>
                            )}
                            <span>Cooldown: {alert.cooldownMinutes}m</span>
                            {alert.lastWarningAt && (
                              <span>Last warning: {formatDate(alert.lastWarningAt)}</span>
                            )}
                            {alert.lastCriticalAt && (
                              <span>Last critical: {formatDate(alert.lastCriticalAt)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => testMutation.mutate(alert.applicationId)}
                          disabled={testMutation.isPending}
                          title="Send test notification"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openConfigDialog(alert.application, alert)}
                          title="Configure"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm('Disable alerts for this application?')) {
                              deleteMutation.mutate(alert.applicationId);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unconfigured Applications */}
      {unconfiguredApps && unconfiguredApps.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08]">
                <HardDrive className="h-5 w-5 text-[#c4bbd3]" />
              </div>
              <div>
                <CardTitle>Applications Without Alerts</CardTitle>
                <CardDescription>
                  Click to configure quota monitoring
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {unconfiguredApps.map((app) => {
                const usage = getUsagePercentage(app.usedStorageBytes, app.maxStorageBytes);
                return (
                  <div
                    key={app.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.04] cursor-pointer transition-all"
                    onClick={() => openConfigDialog(app)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-white">{app.name}</h4>
                      <span className="text-xs text-[#c4bbd3]/60">{usage}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6b21ef]"
                        style={{ width: `${Math.min(usage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#c4bbd3]/60 mt-2">
                      {formatBytes(app.usedStorageBytes)} / {formatBytes(app.maxStorageBytes)}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Quota Alert</DialogTitle>
            <DialogDescription>
              Set up notifications for {selectedApp?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Warning Threshold</Label>
                  <span className="text-sm text-amber-400">{warningThreshold}%</span>
                </div>
                <Slider
                  value={[warningThreshold]}
                  onValueChange={([v]) => setWarningThreshold(v)}
                  min={50}
                  max={95}
                  step={5}
                  className="[&_[role=slider]]:bg-amber-500"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Critical Threshold</Label>
                  <span className="text-sm text-red-400">{criticalThreshold}%</span>
                </div>
                <Slider
                  value={[criticalThreshold]}
                  onValueChange={([v]) => setCriticalThreshold(v)}
                  min={60}
                  max={100}
                  step={5}
                  className="[&_[role=slider]]:bg-red-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emails">Notification Emails</Label>
              <Input
                id="emails"
                value={notifyEmails}
                onChange={(e) => setNotifyEmails(e.target.value)}
                placeholder="admin@example.com, ops@example.com"
              />
              <p className="text-xs text-[#c4bbd3]/60">Separate multiple emails with commas</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cooldown">Cooldown (minutes)</Label>
              <Input
                id="cooldown"
                type="number"
                value={cooldownMinutes}
                onChange={(e) => setCooldownMinutes(parseInt(e.target.value) || 60)}
                min={5}
                max={1440}
              />
              <p className="text-xs text-[#c4bbd3]/60">Minimum time between notifications</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="webhook">Notify via Webhook</Label>
                <p className="text-xs text-[#c4bbd3]/60">Send to application webhooks</p>
              </div>
              <Switch
                id="webhook"
                checked={notifyWebhook}
                onCheckedChange={setNotifyWebhook}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="active">Active</Label>
                <p className="text-xs text-[#c4bbd3]/60">Enable quota monitoring</p>
              </div>
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-[#ee4f27] hover:bg-[#d94520]"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
