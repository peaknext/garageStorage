'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  User,
  Lock,
  Shield,
  Save,
  AlertCircle,
  CheckCircle,
  UserPlus,
  Users,
  Trash2,
  X,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [newAdminForm, setNewAdminForm] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adminMessage, setAdminMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await apiClient.get<UserProfile>('/auth/profile');
      return data;
    },
  });

  const { data: adminsData } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AdminUser[] }>('/admin/settings/admins');
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({ name: profile.name, email: profile.email });
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await apiClient.patch<UserProfile>('/admin/settings/profile', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
      setTimeout(() => setProfileMessage(null), 3000);
    },
    onError: () => {
      setProfileMessage({ type: 'error', text: 'Failed to update profile' });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await apiClient.post('/admin/settings/change-password', data);
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: 'Password changed successfully' });
      setTimeout(() => setPasswordMessage(null), 3000);
    },
    onError: () => {
      setPasswordMessage({ type: 'error', text: 'Failed to change password. Check your current password.' });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const response = await apiClient.post<AdminUser>('/admin/settings/admins', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setNewAdminForm({ email: '', password: '', name: '' });
      setShowCreateAdmin(false);
      setAdminMessage({ type: 'success', text: 'Admin created successfully' });
      setTimeout(() => setAdminMessage(null), 3000);
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      const message = error.response?.data?.message || 'Failed to create admin';
      setAdminMessage({ type: 'error', text: message });
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/settings/admins/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setDeleteConfirm(null);
      setAdminMessage({ type: 'success', text: 'Admin deleted successfully' });
      setTimeout(() => setAdminMessage(null), 3000);
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      const message = error.response?.data?.message || 'Failed to delete admin';
      setAdminMessage({ type: 'error', text: message });
      setDeleteConfirm(null);
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ name: profileForm.name });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminForm.password.length < 6) {
      setAdminMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    createAdminMutation.mutate(newAdminForm);
  };

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-[#c4bbd3] mt-1">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 stagger-children">
        {/* Profile Settings */}
        <Card className="hover:border-white/[0.12] transition-all duration-300">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
                <User className="h-5 w-5 text-[#ee4f27]" />
              </div>
              <div>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Update your account information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Name</label>
                <Input
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, name: e.target.value })
                  }
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Email</label>
                <Input
                  value={profileForm.email}
                  disabled
                  className="bg-white/[0.02] opacity-60 cursor-not-allowed"
                />
                <p className="text-xs text-[#c4bbd3]/60">
                  Email cannot be changed
                </p>
              </div>
              {profileMessage && (
                <div
                  className={`flex items-center gap-2 text-sm p-3 rounded-xl border ${
                    profileMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}
                >
                  {profileMessage.type === 'success' ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  {profileMessage.text}
                </div>
              )}
              <Button type="submit" disabled={updateProfileMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="hover:border-white/[0.12] transition-all duration-300">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                <Lock className="h-5 w-5 text-[#6b21ef]" />
              </div>
              <div>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your password for security</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Current Password</label>
                <Input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value,
                    })
                  }
                  placeholder="Enter current password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">New Password</label>
                <Input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Confirm Password</label>
                <Input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="Confirm new password"
                />
              </div>
              {passwordMessage && (
                <div
                  className={`flex items-center gap-2 text-sm p-3 rounded-xl border ${
                    passwordMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}
                >
                  {passwordMessage.type === 'success' ? (
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  )}
                  {passwordMessage.text}
                </div>
              )}
              <Button type="submit" variant="secondary" disabled={changePasswordMutation.isPending}>
                <Lock className="mr-2 h-4 w-4" />
                {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Admin Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-white/[0.08]">
                <Users className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle>Admin Users</CardTitle>
                <CardDescription>Manage administrator accounts</CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowCreateAdmin(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Admin
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {adminMessage && (
            <div
              className={`mb-6 flex items-center gap-2 rounded-xl p-4 text-sm border ${
                adminMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}
            >
              {adminMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {adminMessage.text}
            </div>
          )}

          {/* Create Admin Form */}
          {showCreateAdmin && (
            <div className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 animate-scale-in">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
                    <UserPlus className="h-4 w-4 text-[#ee4f27]" />
                  </div>
                  <h3 className="font-medium text-white">Create New Admin</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateAdmin(false);
                    setNewAdminForm({ email: '', password: '', name: '' });
                  }}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <form onSubmit={handleCreateAdmin} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Name</label>
                    <Input
                      value={newAdminForm.name}
                      onChange={(e) =>
                        setNewAdminForm({ ...newAdminForm, name: e.target.value })
                      }
                      placeholder="Admin name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Email</label>
                    <Input
                      type="email"
                      value={newAdminForm.email}
                      onChange={(e) =>
                        setNewAdminForm({ ...newAdminForm, email: e.target.value })
                      }
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Password</label>
                    <Input
                      type="password"
                      value={newAdminForm.password}
                      onChange={(e) =>
                        setNewAdminForm({ ...newAdminForm, password: e.target.value })
                      }
                      placeholder="Min 6 characters"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={createAdminMutation.isPending}>
                    {createAdminMutation.isPending ? 'Creating...' : 'Create Admin'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateAdmin(false);
                      setNewAdminForm({ email: '', password: '', name: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Admin List */}
          <div className="space-y-4">
            {adminsData?.data?.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-white/[0.12] hover:bg-white/[0.03] transition-all duration-300 group"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                    <User className="h-5 w-5 text-[#6b21ef]" />
                  </div>
                  <div>
                    <p className="font-medium text-white flex items-center gap-2">
                      {admin.name}
                      {admin.id === profile?.id && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#ee4f27]/10 border border-[#ee4f27]/20 text-[#ee4f27]">You</span>
                      )}
                    </p>
                    <p className="text-sm text-[#c4bbd3]">{admin.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-full bg-[#6b21ef]/10 border border-[#6b21ef]/20 px-3 py-1 text-xs font-medium text-[#6b21ef]">
                      {admin.role}
                    </span>
                    <p className="mt-2 text-sm text-[#c4bbd3]/70">
                      Created {formatDate(admin.createdAt)}
                    </p>
                  </div>
                  {admin.id !== profile?.id && (
                    <>
                      {deleteConfirm === admin.id ? (
                        <div className="flex items-center gap-2 animate-fade-in">
                          <span className="text-sm text-[#c4bbd3]">Delete?</span>
                          <Button
                            size="sm"
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20"
                            onClick={() => deleteAdminMutation.mutate(admin.id)}
                            disabled={deleteAdminMutation.isPending}
                          >
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-[#c4bbd3]/60 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          onClick={() => setDeleteConfirm(admin.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {(!adminsData?.data || adminsData.data.length === 0) && (
              <div className="py-12 text-center">
                <Users className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
                <p className="text-[#c4bbd3]">No admin users found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/5 border border-white/[0.08]">
              <Shield className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your account details and role</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">User ID</p>
              <p className="font-mono text-sm text-white break-all">{profile?.id}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">Role</p>
              <span className="inline-flex items-center rounded-full bg-[#ee4f27]/10 border border-[#ee4f27]/20 px-3 py-1.5 text-sm font-medium text-[#ee4f27]">
                {profile?.role}
              </span>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">Email</p>
              <p className="text-sm text-white">{profile?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
