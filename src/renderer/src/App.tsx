import React, { useEffect } from 'react'
import { Layout } from './components/layout/Layout'
import { useAppStore } from './stores/appStore'

export default function App() {
  const loadData = useAppStore((s) => s.loadData)
  const refreshTasks = useAppStore((s) => s.refreshTasks)

  useEffect(() => {
    loadData()

    // Refresh task list every 10s to pick up status changes
    const interval = setInterval(refreshTasks, 10_000)
    return () => clearInterval(interval)
  }, [loadData, refreshTasks])

  return <Layout />
}
