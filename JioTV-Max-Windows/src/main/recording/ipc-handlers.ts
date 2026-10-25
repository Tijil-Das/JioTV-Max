import { ipcMain, shell } from 'electron'
import { IPC } from '../../shared/ipc'
import type { RecordingManager } from './recording-manager'
import { Validators } from './validators'
import { CapabilityProbe } from './capability-probe'
import type { ConflictRecord, RecordingPreferences } from '../../shared/recording-types'

export function registerRecordingIpc(manager: RecordingManager): void {
  ipcMain.handle(IPC.recordingSchedule, async (_event, input) => {
    return manager.scheduleRecording(input)
  })

  ipcMain.handle(IPC.recordingStartNow, async (_event, input) => {
    return manager.scheduleRecording({
      ...input,
      isRecordNow: true,
      fromEpochMs: Date.now()
    })
  })

  ipcMain.handle(IPC.recordingPause, async (_event, id: string) => {
    return manager.pauseRecording(id)
  })

  ipcMain.handle(IPC.recordingResume, async (_event, id: string) => {
    return manager.resumeRecording(id)
  })

  ipcMain.handle(IPC.recordingStop, async (_event, id: string) => {
    return manager.stopRecording(id)
  })

  ipcMain.handle(IPC.recordingCancel, async (_event, id: string) => {
    return manager.cancelRecording(id)
  })

  ipcMain.handle(IPC.recordingDelete, async (_event, id: string) => {
    return manager.deleteRecording(id)
  })

  ipcMain.handle(IPC.recordingGetAll, async () => {
    return manager.getAllRecordings()
  })

  ipcMain.handle(IPC.recordingGetActive, async () => {
    return manager.getActiveStats()
  })

  ipcMain.handle(IPC.recordingGetDiagnostics, async (_event, id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (manager as any).repo.getDiagnostics(id)
  })

  ipcMain.handle(IPC.recordingUpdateEndTime, async (_event, id: string, newEndEpochMs: number) => {
    return manager.updateEndTime(id, newEndEpochMs)
  })

  ipcMain.handle(IPC.recordingRename, async (_event, id: string, newFilename: string) => {
    return manager.renameRecording(id, newFilename)
  })

  ipcMain.handle(IPC.recordingPlayFile, async (_event, id: string) => {
    return manager.playRecording(id)
  })

  ipcMain.handle(IPC.recordingRetryFinalize, async (_event, id: string) => {
    return manager.retryFinalize(id)
  })

  ipcMain.handle(IPC.recordingResolveConflict, async (_event, conflictId: string, decision: ConflictRecord['decision']) => {
    manager.resolveConflict(conflictId, decision)
    return true
  })

  ipcMain.handle(IPC.recordingValidate, async (_event, input) => {
    const existing = manager.getExistingIntervals()
    return Validators.validateAll({
      ...input,
      existingIntervals: existing
    })
  })

  ipcMain.handle(IPC.recordingProbeCapabilities, async (_event, forceRecheck: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = (manager as any).repo
    return CapabilityProbe.probe(repo, forceRecheck)
  })

  ipcMain.handle(IPC.recordingGetPreferences, async () => {
    return manager.getPreferences()
  })

  ipcMain.handle(IPC.recordingSavePreferences, async (_event, prefs: Partial<RecordingPreferences>) => {
    return manager.savePreferences(prefs)
  })

  ipcMain.handle(IPC.recordingNotificationsGet, async (_event, limit?: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifier = (manager as any).notifier
    return {
      notifications: notifier.getAll(limit),
      unreadCount: notifier.getUnreadCount(),
      activeBanners: notifier.getActiveBanners()
    }
  })

  ipcMain.handle(IPC.recordingNotificationsMarkRead, async (_event, id?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifier = (manager as any).notifier
    if (id) notifier.markRead(id)
    else notifier.markAllRead()
    return true
  })

  ipcMain.handle(IPC.recordingNotificationsMarkActed, async (_event, id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifier = (manager as any).notifier
    notifier.markActed(id)
    return true
  })

  ipcMain.handle(IPC.recordingOpenFolder, async (_event, folderPath?: string) => {
    const target = folderPath || manager.getPreferences().defaultFolder
    await shell.openPath(target)
    return true
  })

  ipcMain.handle(IPC.recordingReportStall, async () => {
    manager.reportPlayerStall()
    return true
  })

  ipcMain.handle(IPC.recordingPauseAll, async () => {
    manager.pauseAll()
    return true
  })

  ipcMain.handle(IPC.desktopCaptureGetSources, async () => {
    const { desktopCapturer } = await import('electron')
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }))
  })
}
