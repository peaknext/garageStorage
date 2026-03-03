import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  globalSearch: string;
  activeAppFilter: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setGlobalSearch: (search: string) => void;
  setActiveAppFilter: (appId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  globalSearch: '',
  activeAppFilter: null,

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setGlobalSearch: (search) => set({ globalSearch: search }),
  setActiveAppFilter: (appId) => set({ activeAppFilter: appId }),
}));
