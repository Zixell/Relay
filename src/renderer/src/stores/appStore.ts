import { create } from 'zustand'
import type { Task, Project } from '../types'
import { MOCK_TASKS, MOCK_PROJECTS } from '../lib/mockData'

interface AppState {
  // Data
  tasks: Task[]
  projects: Project[]
  selectedTaskId: string | null
  selectedProjectId: string | null
  searchQuery: string
  statusFilter: string | null
  isCreateModalOpen: boolean
  isSettingsOpen: boolean
  isLoading: boolean

  // Actions
  setTasks: (tasks: Task[]) => void
  setProjects: (projects: Project[]) => void
  selectTask: (id: string | null) => void
  setProjectFilter: (id: string | null) => void
  setSearch: (q: string) => void
  setStatusFilter: (s: string | null) => void
  openCreateModal: () => void
  closeCreateModal: () => void
  openSettings: () => void
  closeSettings: () => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  addProject: (project: Project) => void
  loadData: () => Promise<void>
  refreshTasks: () => Promise<void>
}

const isElectron = typeof window !== 'undefined' && !!window.api

export const useAppStore = create<AppState>((set, get) => ({
  tasks: MOCK_TASKS,
  projects: MOCK_PROJECTS,
  selectedTaskId: null,
  selectedProjectId: null,
  searchQuery: '',
  statusFilter: null,
  isCreateModalOpen: false,
  isSettingsOpen: false,
  isLoading: false,

  setTasks: (tasks) => set({ tasks }),
  setProjects: (projects) => set({ projects }),

  selectTask: (id) => set({ selectedTaskId: id }),

  setProjectFilter: (selectedProjectId) => set({ selectedProjectId, selectedTaskId: null }),

  setSearch: (searchQuery) => set({ searchQuery }),

  setStatusFilter: (statusFilter) => set({ statusFilter }),

  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  addTask: (task) =>
    set((s) => ({ tasks: [task, ...s.tasks.filter((t) => t.id !== task.id)] })),

  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),

  deleteTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId
    })),

  addProject: (project) => set((s) => ({ projects: [project, ...s.projects] })),

  loadData: async () => {
    if (!isElectron) return
    set({ isLoading: true })
    try {
      const [tasks, projects] = await Promise.all([
        window.api.tasks.getAll(),
        window.api.projects.getAll()
      ])
      set({
        tasks: tasks.length ? tasks : MOCK_TASKS,
        projects: projects.length ? projects : MOCK_PROJECTS
      })
    } catch {
      // Keep mock data on error
    } finally {
      set({ isLoading: false })
    }
  },

  refreshTasks: async () => {
    if (!isElectron) return
    try {
      const tasks: Task[] = await window.api.tasks.getAll()
      if (tasks.length) {
        const deduped = tasks.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
        set({ tasks: deduped })
      }
    } catch {
      // ignore
    }
  }
}))

// Derived selectors
export const selectFilteredTasks = (state: AppState) => {
  let tasks = state.tasks
  if (state.selectedProjectId) {
    tasks = tasks.filter((t) => t.project_id === state.selectedProjectId)
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase()
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.project_name.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
    )
  }
  if (state.statusFilter) {
    tasks = tasks.filter((t) => t.status === state.statusFilter)
  }
  return tasks
}

export const selectSelectedTask = (state: AppState) =>
  state.selectedTaskId ? state.tasks.find((t) => t.id === state.selectedTaskId) ?? null : null
