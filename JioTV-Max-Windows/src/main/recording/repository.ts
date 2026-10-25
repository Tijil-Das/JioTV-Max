import fs from 'node:fs'
import path from 'node:path'
import { openDatabase, type DatabaseType } from './db-native'
import type {
  RecordingRecord,
  RecordingPart,
  RecordingEvent,
  ConflictRecord,
  NotificationRecord,
  CapabilityProbeResult,
  RecordingStatus
} from '../../shared/recording-types'

export class RecordingRepository {
  private db: DatabaseType

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.db = openDatabase(dbPath)
    this.initPragmas()
    this.runMigrations()
  }

  private initPragmas(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `)

    const currentVersionRow = this.db
      .prepare('SELECT MAX(version) AS max_v FROM schema_migrations')
      .get() as { max_v: number | null } | undefined

    const currentVersion = currentVersionRow?.max_v ?? 0

    if (currentVersion < 1) {
      this.migrationV1()
      this.db
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(1, new Date().toISOString())
    }
  }

  private migrationV1(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name_snapshot TEXT NOT NULL,
        channel_logo TEXT,
        status TEXT NOT NULL,
        planned_start_utc TEXT NOT NULL,
        planned_end_utc TEXT NOT NULL,
        actual_start_utc TEXT,
        actual_end_utc TEXT,
        padding_minutes INTEGER NOT NULL DEFAULT 0,
        quality TEXT NOT NULL DEFAULT 'highest',
        resolution TEXT,
        bitrate INTEGER,
        folder TEXT NOT NULL,
        is_default_folder INTEGER NOT NULL DEFAULT 1,
        filename TEXT NOT NULL,
        final_path TEXT,
        temp_conflict_name TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        duration_seconds REAL NOT NULL DEFAULT 0,
        overlay_settings TEXT,
        overlay_applied INTEGER NOT NULL DEFAULT 0,
        is_partial INTEGER NOT NULL DEFAULT 0,
        partial_reasons TEXT,
        notified INTEGER NOT NULL DEFAULT 0,
        missed_reason TEXT,
        failure_reason TEXT,
        recurrence_rule TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
      CREATE INDEX IF NOT EXISTS idx_recordings_channel ON recordings(channel_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_account ON recordings(account_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_planned_start ON recordings(planned_start_utc);

      CREATE TABLE IF NOT EXISTS recording_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        part_index INTEGER NOT NULL,
        path TEXT NOT NULL,
        start_utc TEXT NOT NULL,
        end_utc TEXT,
        bytes INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL DEFAULT 'copy'
      );

      CREATE INDEX IF NOT EXISTS idx_recording_parts_rec_id ON recording_parts(recording_id);

      CREATE TABLE IF NOT EXISTS recording_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recording_events_rec_id ON recording_events(recording_id);

      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        target_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decision TEXT,
        suggested_name TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conflicts_rec_id ON conflicts(recording_id);
      CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        payload TEXT,
        dedupe_key TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_acted INTEGER NOT NULL DEFAULT 0,
        action_data TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(dedupe_key);

      CREATE TABLE IF NOT EXISTS capability_cache (
        fingerprint TEXT PRIMARY KEY,
        cpu_model TEXT NOT NULL,
        cores INTEGER NOT NULL,
        ram_bytes INTEGER NOT NULL,
        gpu_model TEXT NOT NULL,
        encoders TEXT NOT NULL,
        benchmark_fps REAL NOT NULL,
        benchmark_speed REAL NOT NULL,
        tier TEXT NOT NULL,
        reason TEXT,
        tested_at TEXT NOT NULL
      );
    `)
  }

  // -------------------------------------------------------------
  // Recordings
  // -------------------------------------------------------------

  insertRecording(rec: RecordingRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO recordings (
        id, account_id, channel_id, channel_name_snapshot, channel_logo, status,
        planned_start_utc, planned_end_utc, actual_start_utc, actual_end_utc,
        padding_minutes, quality, resolution, bitrate, folder, is_default_folder,
        filename, final_path, temp_conflict_name, size_bytes, duration_seconds,
        overlay_settings, overlay_applied, is_partial, partial_reasons, notified,
        missed_reason, failure_reason, created_at, updated_at
      ) VALUES (
        @id, @accountId, @channelId, @channelName, @channelLogo, @status,
        @plannedStartUtc, @plannedEndUtc, @actualStartUtc, @actualEndUtc,
        @paddingMinutes, @quality, @resolution, @bitrate, @folder, @isDefaultFolder,
        @filename, @finalPath, @tempConflictName, @sizeBytes, @durationSeconds,
        @overlaySettings, @overlayApplied, @isPartial, @partialReasons, @notified,
        @missedReason, @failureReason, @createdAt, @updatedAt
      )
    `)

    stmt.run({
      id: rec.id,
      accountId: rec.accountId,
      channelId: rec.channelId,
      channelName: rec.channelName,
      channelLogo: rec.channelLogo ?? null,
      status: rec.status,
      plannedStartUtc: rec.plannedStartUtc,
      plannedEndUtc: rec.plannedEndUtc,
      actualStartUtc: rec.actualStartUtc ?? null,
      actualEndUtc: rec.actualEndUtc ?? null,
      paddingMinutes: rec.paddingMinutes ?? 0,
      quality: rec.quality ?? 'highest',
      resolution: rec.resolution ?? null,
      bitrate: rec.bitrate ?? null,
      folder: rec.folder,
      isDefaultFolder: rec.isDefaultFolder ? 1 : 0,
      filename: rec.filename,
      finalPath: rec.finalPath ?? null,
      tempConflictName: rec.tempConflictName ?? null,
      sizeBytes: rec.sizeBytes ?? 0,
      durationSeconds: rec.durationSeconds ?? 0,
      overlaySettings: rec.overlaySettings ?? null,
      overlayApplied: rec.overlayApplied ? 1 : 0,
      isPartial: rec.isPartial ? 1 : 0,
      partialReasons: rec.partialReasons ?? null,
      notified: rec.notified ? 1 : 0,
      missedReason: rec.missedReason ?? null,
      failureReason: rec.failureReason ?? null,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt
    })
  }

  getRecording(id: string): RecordingRecord | null {
    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined

    if (!row) return null
    return this.mapRecordingRow(row)
  }

  getAllRecordings(accountId?: string): RecordingRecord[] {
    const sql = accountId
      ? 'SELECT * FROM recordings WHERE account_id = ? ORDER BY planned_start_utc DESC'
      : 'SELECT * FROM recordings ORDER BY planned_start_utc DESC'

    const rows = (accountId ? this.db.prepare(sql).all(accountId) : this.db.prepare(sql).all()) as Array<
      Record<string, unknown>
    >
    return rows.map((r) => this.mapRecordingRow(r))
  }

  getRecordingsByStatus(statuses: RecordingStatus[], accountId?: string): RecordingRecord[] {
    if (statuses.length === 0) return []
    const placeholders = statuses.map(() => '?').join(',')
    const sql = accountId
      ? `SELECT * FROM recordings WHERE account_id = ? AND status IN (${placeholders}) ORDER BY planned_start_utc ASC`
      : `SELECT * FROM recordings WHERE status IN (${placeholders}) ORDER BY planned_start_utc ASC`

    const params = accountId ? [accountId, ...statuses] : statuses
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>
    return rows.map((r) => this.mapRecordingRow(r))
  }

  transitionStatus(
    id: string,
    toStatus: RecordingStatus,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    const now = new Date().toISOString()
    const tx = this.db.transaction(() => {
      const current = this.db.prepare('SELECT status FROM recordings WHERE id = ?').get(id) as
        | { status: string }
        | undefined
      const fromStatus = current?.status

      this.db
        .prepare('UPDATE recordings SET status = ?, updated_at = ? WHERE id = ?')
        .run(toStatus, now, id)

      this.db.prepare(`
        INSERT INTO recording_events (recording_id, type, from_status, to_status, message, metadata, timestamp)
        VALUES (?, 'transition', ?, ?, ?, ?, ?)
      `).run(
        id,
        fromStatus ?? null,
        toStatus,
        message,
        metadata ? JSON.stringify(metadata) : null,
        now
      )
    })
    tx()
  }

  updateRecordingFields(id: string, fields: Partial<RecordingRecord>): void {
    const updates: string[] = []
    const params: Record<string, unknown> = { id, updatedAt: new Date().toISOString() }

    for (const [key, val] of Object.entries(fields)) {
      if (key === 'id') continue
      const col = this.camelToSnake(key)
      updates.push(`${col} = @${key}`)
      if (typeof val === 'boolean') {
        params[key] = val ? 1 : 0
      } else {
        params[key] = val ?? null
      }
    }

    if (updates.length === 0) return
    updates.push('updated_at = @updatedAt')

    this.db.prepare(`UPDATE recordings SET ${updates.join(', ')} WHERE id = @id`).run(params)
  }

  deleteRecording(id: string): void {
    this.db.prepare('DELETE FROM recordings WHERE id = ?').run(id)
  }

  // -------------------------------------------------------------
  // Parts
  // -------------------------------------------------------------

  addPart(part: RecordingPart): number {
    const stmt = this.db.prepare(`
      INSERT INTO recording_parts (recording_id, part_index, path, start_utc, end_utc, bytes, mode)
      VALUES (@recordingId, @partIndex, @path, @startUtc, @endUtc, @bytes, @mode)
    `)
    const res = stmt.run({
      ...part,
      endUtc: part.endUtc ?? null
    })
    return Number(res.lastInsertRowid)
  }

  getParts(recordingId: string): RecordingPart[] {
    const rows = this.db
      .prepare('SELECT * FROM recording_parts WHERE recording_id = ? ORDER BY part_index ASC')
      .all(recordingId) as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: Number(r.id),
      recordingId: String(r.recording_id),
      partIndex: Number(r.part_index),
      path: String(r.path),
      startUtc: String(r.start_utc),
      endUtc: r.end_utc ? String(r.end_utc) : undefined,
      bytes: Number(r.bytes),
      mode: (r.mode as 'copy' | 'encode') || 'copy'
    }))
  }

  updatePart(id: number, endUtc: string, bytes: number): void {
    this.db
      .prepare('UPDATE recording_parts SET end_utc = ?, bytes = ? WHERE id = ?')
      .run(endUtc, bytes, id)
  }

  // -------------------------------------------------------------
  // Events
  // -------------------------------------------------------------

  addEvent(event: RecordingEvent): void {
    this.db.prepare(`
      INSERT INTO recording_events (recording_id, type, from_status, to_status, message, metadata, timestamp)
      VALUES (@recordingId, @type, @fromStatus, @toStatus, @message, @metadata, @timestamp)
    `).run({
      ...event,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      metadata: event.metadata ?? null
    })
  }

  getEvents(recordingId: string): RecordingEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM recording_events WHERE recording_id = ? ORDER BY id ASC')
      .all(recordingId) as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: Number(r.id),
      recordingId: String(r.recording_id),
      type: r.type as RecordingEvent['type'],
      fromStatus: r.from_status ? String(r.from_status) : undefined,
      toStatus: r.to_status ? String(r.to_status) : undefined,
      message: String(r.message),
      metadata: r.metadata ? String(r.metadata) : undefined,
      timestamp: String(r.timestamp)
    }))
  }

  // -------------------------------------------------------------
  // Conflicts
  // -------------------------------------------------------------

  addConflict(conflict: ConflictRecord): void {
    this.db.prepare(`
      INSERT INTO conflicts (id, recording_id, type, target_path, status, decision, suggested_name, resolved_at, created_at)
      VALUES (@id, @recordingId, @type, @targetPath, @status, @decision, @suggestedName, @resolvedAt, @createdAt)
    `).run({
      ...conflict,
      decision: conflict.decision ?? null,
      suggestedName: conflict.suggestedName ?? null,
      resolvedAt: conflict.resolvedAt ?? null
    })
  }

  getPendingConflicts(): ConflictRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM conflicts WHERE status = 'pending' ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: String(r.id),
      recordingId: String(r.recording_id),
      type: r.type as ConflictRecord['type'],
      targetPath: String(r.target_path),
      status: r.status as ConflictRecord['status'],
      decision: r.decision ? (String(r.decision) as ConflictRecord['decision']) : undefined,
      suggestedName: r.suggested_name ? String(r.suggested_name) : undefined,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : undefined,
      createdAt: String(r.created_at)
    }))
  }

  resolveConflict(id: string, decision: ConflictRecord['decision']): void {
    const now = new Date().toISOString()
    this.db
      .prepare("UPDATE conflicts SET status = 'resolved', decision = ?, resolved_at = ? WHERE id = ?")
      .run(decision, now, id)
  }

  // -------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------

  addNotification(notif: NotificationRecord): void {
    this.db.prepare(`
      INSERT INTO notifications (id, type, title, message, payload, dedupe_key, is_read, is_acted, action_data, created_at)
      VALUES (@id, @type, @title, @message, @payload, @dedupeKey, @isRead, @isActed, @actionData, @createdAt)
    `).run({
      ...notif,
      payload: notif.payload ?? null,
      dedupeKey: notif.dedupeKey ?? null,
      isRead: notif.isRead ? 1 : 0,
      isActed: notif.isActed ? 1 : 0,
      actionData: notif.actionData ?? null
    })
  }

  getNotifications(limit = 50): NotificationRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>

    return rows.map((r) => ({
      id: String(r.id),
      type: r.type as NotificationRecord['type'],
      title: String(r.title),
      message: String(r.message),
      payload: r.payload ? String(r.payload) : undefined,
      dedupeKey: r.dedupe_key ? String(r.dedupe_key) : undefined,
      isRead: Boolean(r.is_read),
      isActed: Boolean(r.is_acted),
      actionData: r.action_data ? String(r.action_data) : undefined,
      createdAt: String(r.created_at)
    }))
  }

  getUnreadNotificationCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0')
      .get() as { c: number }
    return row.c
  }

  markNotificationRead(id: string): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
  }

  markAllNotificationsRead(): void {
    this.db.prepare('UPDATE notifications SET is_read = 1').run()
  }

  markNotificationActed(id: string): void {
    this.db.prepare('UPDATE notifications SET is_acted = 1, is_read = 1 WHERE id = ?').run(id)
  }

  hasDedupeKey(key: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM notifications WHERE dedupe_key = ? LIMIT 1')
      .get(key)
    return Boolean(row)
  }

  // -------------------------------------------------------------
  // Capability Cache
  // -------------------------------------------------------------

  getCapabilityCache(fingerprint: string): CapabilityProbeResult | null {
    const row = this.db
      .prepare('SELECT * FROM capability_cache WHERE fingerprint = ?')
      .get(fingerprint) as Record<string, unknown> | undefined

    if (!row) return null
    return {
      fingerprint: String(row.fingerprint),
      cpuModel: String(row.cpu_model),
      cores: Number(row.cores),
      ramBytes: Number(row.ram_bytes),
      gpuModel: String(row.gpu_model),
      encoders: JSON.parse(String(row.encoders || '[]')),
      benchmarkFps: Number(row.benchmark_fps),
      benchmarkSpeed: Number(row.benchmark_speed),
      tier: row.tier as CapabilityProbeResult['tier'],
      reason: row.reason ? String(row.reason) : undefined,
      testedAt: String(row.tested_at)
    }
  }

  saveCapabilityCache(cap: CapabilityProbeResult): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO capability_cache (
        fingerprint, cpu_model, cores, ram_bytes, gpu_model, encoders,
        benchmark_fps, benchmark_speed, tier, reason, tested_at
      ) VALUES (
        @fingerprint, @cpuModel, @cores, @ramBytes, @gpuModel, @encoders,
        @benchmarkFps, @benchmarkSpeed, @tier, @reason, @testedAt
      )
    `).run({
      ...cap,
      encoders: JSON.stringify(cap.encoders),
      reason: cap.reason ?? null
    })
  }

  // -------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------

  getDiagnostics(recordingId: string): string {
    const rec = this.getRecording(recordingId)
    if (!rec) return 'Recording not found.'
    const parts = this.getParts(recordingId)
    const events = this.getEvents(recordingId)
    return JSON.stringify(
      {
        recording: rec,
        parts,
        events,
        dumpedAt: new Date().toISOString()
      },
      null,
      2
    )
  }

  close(): void {
    this.db.close()
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  private mapRecordingRow(r: Record<string, unknown>): RecordingRecord {
    return {
      id: String(r.id),
      accountId: String(r.account_id),
      channelId: String(r.channel_id),
      channelName: String(r.channel_name_snapshot),
      channelLogo: r.channel_logo ? String(r.channel_logo) : undefined,
      status: r.status as RecordingStatus,
      plannedStartUtc: String(r.planned_start_utc),
      plannedEndUtc: String(r.planned_end_utc),
      actualStartUtc: r.actual_start_utc ? String(r.actual_start_utc) : undefined,
      actualEndUtc: r.actual_end_utc ? String(r.actual_end_utc) : undefined,
      paddingMinutes: Number(r.padding_minutes),
      quality: (r.quality as 'highest' | 'balanced') || 'highest',
      resolution: r.resolution ? String(r.resolution) : undefined,
      bitrate: r.bitrate ? Number(r.bitrate) : undefined,
      folder: String(r.folder),
      isDefaultFolder: Boolean(r.is_default_folder),
      filename: String(r.filename),
      finalPath: r.final_path ? String(r.final_path) : undefined,
      tempConflictName: r.temp_conflict_name ? String(r.temp_conflict_name) : undefined,
      sizeBytes: Number(r.size_bytes),
      durationSeconds: Number(r.duration_seconds),
      overlaySettings: r.overlay_settings ? String(r.overlay_settings) : undefined,
      overlayApplied: Boolean(r.overlay_applied),
      isPartial: Boolean(r.is_partial),
      partialReasons: r.partial_reasons ? String(r.partial_reasons) : undefined,
      notified: Boolean(r.notified),
      missedReason: r.missed_reason ? String(r.missed_reason) : undefined,
      failureReason: r.failure_reason ? String(r.failure_reason) : undefined,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at)
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }
}
