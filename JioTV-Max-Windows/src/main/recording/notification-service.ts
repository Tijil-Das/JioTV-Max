import crypto from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { RecordingRepository } from './repository'
import type { NotificationRecord, NotificationType } from '../../shared/recording-types'
import { IPC } from '../../shared/ipc'

export interface NotifyOptions {
  type: NotificationType
  title: string
  message: string
  payload?: Record<string, unknown>
  dedupeKey?: string
  actionData?: Record<string, unknown>
}

export class NotificationService {
  private static instance: NotificationService | null = null
  private getMainWindow: () => BrowserWindow | null

  constructor(
    private readonly repo: RecordingRepository,
    getMainWindow: () => BrowserWindow | null
  ) {
    this.getMainWindow = getMainWindow
    NotificationService.instance = this
  }

  static getInstance(): NotificationService | null {
    return NotificationService.instance
  }

  notify(options: NotifyOptions): NotificationRecord | null {
    // 1. Deduplication check
    if (options.dedupeKey) {
      if (this.repo.hasDedupeKey(options.dedupeKey)) {
        return null // Already exists and recorded
      }
    }

    const id = `notif_${crypto.randomUUID().slice(0, 12)}`
    const notif: NotificationRecord = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      payload: options.payload ? JSON.stringify(options.payload) : undefined,
      dedupeKey: options.dedupeKey,
      isRead: false,
      isActed: false,
      actionData: options.actionData ? JSON.stringify(options.actionData) : undefined,
      createdAt: new Date().toISOString()
    }

    this.repo.addNotification(notif)
    this.broadcastChange()
    return notif
  }

  markRead(id: string): void {
    this.repo.markNotificationRead(id)
    this.broadcastChange()
  }

  markAllRead(): void {
    this.repo.markAllNotificationsRead()
    this.broadcastChange()
  }

  markActed(id: string): void {
    this.repo.markNotificationActed(id)
    this.broadcastChange()
  }

  getAll(limit = 50): NotificationRecord[] {
    return this.repo.getNotifications(limit)
  }

  getUnreadCount(): number {
    return this.repo.getUnreadNotificationCount()
  }

  getActiveBanners(): NotificationRecord[] {
    const all = this.repo.getNotifications(30)
    // Active banners are unacted persistent notifications: conflict, needs_attention, missed, disk_low, buffering_hint
    return all.filter((n) => !n.isActed && ['conflict', 'failed', 'missed', 'disk_low', 'buffering_hint', 'partial'].includes(n.type))
  }

  private broadcastChange(): void {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('recording:notifications-changed', {
        unreadCount: this.getUnreadCount(),
        activeBanners: this.getActiveBanners()
      })
    }
  }
}
