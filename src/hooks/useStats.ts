import { useState, useEffect, useCallback } from 'react'

export interface BookmarkStats {
  id: string
  visitCount: number
  lastVisitTime: number | null
}

export function useStats() {
  const [stats, setStats] = useState<Record<string, { count: number; lastVisit: number | null }>>(
    {}
  )
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      // Mock data for development
      return
    }

    setLoading(true)
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getBookmarksWithVisitStats' })
      if (response && response.success) {
        const statsMap: Record<string, { count: number; lastVisit: number | null }> = {}
        response.bookmarks.forEach((b: any) => {
          statsMap[b.id] = {
            count: b.visitCount || 0,
            lastVisit: b.lastVisitTime || null
          }
        })
        setStats(statsMap)
      }
    } catch (error) {
      console.error('Failed to fetch visit stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, refresh: fetchStats }
}
