'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  FileX,
  Tag,
  Folder,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/buckets', label: 'Buckets', icon: FolderOpen },
  { href: '/tags', label: 'Tags', icon: Tag },
  { href: '/shares', label: 'Share Links', icon: Link2 },
  { href: '/orphan-files', label: 'Orphan Files', icon: FileX },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText },
  { href: '/policies', label: 'Policies', icon: Shield },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
  };

  return (
    <div className="flex h-screen w-64 flex-col border-r border-white/[0.06] bg-[#0e0918]">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-white/[0.06] px-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27] to-[#6b21ef] shadow-[0_0_20px_rgba(238,79,39,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_25px_rgba(238,79,39,0.5)]">
            <FolderOpen className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight">
            Garage Storage
          </span>
        </Link>
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
