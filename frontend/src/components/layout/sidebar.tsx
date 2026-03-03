'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  AppWindow,
  FolderOpen,
  Link2,
  BarChart3,
  Settings,
  LogOut,
  ScrollText,
  Shield,
  Bell,
  BellDot,
  FileX,
  Tag,
  Folder,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/buckets', label: 'Buckets', icon: FolderOpen },
  { href: '/tags', label: 'Tags', icon: Tag },
  { href: '/shares', label: 'Share Links', icon: Link2 },
  { href: '/orphan-files', label: 'Orphan Files', icon: FileX },
  { href: '/recycle-bin', label: 'Recycle Bin', icon: Trash2 },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText },
  { href: '/policies', label: 'Policies', icon: Shield },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ count: number }>('/admin/notifications/unread-count');
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: any[]; meta: any }>('/admin/notifications?limit=10');
      return data;
    },
    enabled: showNotifications,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post('/admin/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const handleLogout = async () => {
    try {
      const { apiClient } = await import('@/lib/api-client');
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore errors - we're logging out anyway
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen w-64 flex-col border-r border-white/[0.06] bg-[#0e0918]">
      {/* Logo + Notification Bell */}
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27] to-[#6b21ef] shadow-[0_0_20px_rgba(238,79,39,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_25px_rgba(238,79,39,0.5)]">
            <FolderOpen className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight">
            SKH Storage
          </span>
        </Link>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            {unreadCount > 0 ? (
              <BellDot className="h-5 w-5 text-[#ee4f27]" />
            ) : (
              <Bell className="h-5 w-5 text-[#c4bbd3]" />
            )}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ee4f27] px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 z-50 rounded-xl border border-white/[0.08] bg-[#1a1025] shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-white">Notifications</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      className="text-xs text-[#ee4f27] hover:text-[#ee4f27]/80"
                    >
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setShowNotifications(false)}>
                    <X className="h-4 w-4 text-[#c4bbd3]" />
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notificationsData?.data?.length ? (
                  notificationsData.data.map((n: any) => (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-3 border-b border-white/[0.04] last:border-0',
                        !n.readAt && 'bg-[#6b21ef]/5',
                      )}
                    >
                      <p className="text-sm text-white">{n.title}</p>
                      <p className="text-xs text-[#c4bbd3]/70 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-[#c4bbd3]/50 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-sm text-[#c4bbd3]/50">
                    No notifications
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-[#ee4f27]/10 text-[#ee4f27] border border-[#ee4f27]/20 shadow-[0_0_20px_rgba(238,79,39,0.15)]'
                  : 'text-[#c4bbd3] hover:bg-white/[0.05] hover:text-white border border-transparent',
              )}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 transition-all duration-200',
                  isActive && 'drop-shadow-[0_0_8px_rgba(238,79,39,0.6)]',
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/[0.06] p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-[#c4bbd3] hover:text-[#ee4f27] hover:bg-[#ee4f27]/10 rounded-xl"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Logout
        </Button>
      </div>
    </div>
  );
}
