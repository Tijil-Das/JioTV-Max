import { screen } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Rectangle } from 'electron'

export interface WindowState extends Rectangle {
  maximized: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1440,
  height: 860,
  x: 0,
  y: 0,
  maximized: false
}

/**
 * Remember window geometry between launches. Coordinates are validated against
 * the current display layout so a window from a disconnected monitor cannot
 * reopen off-screen.
 */
export class WindowStateStore {
  private readonly file: string
  private saveTimer: NodeJS.Timeout | null = null

  constructor(userDataPath: string) {
    this.file = path.join(userDataPath, 'window-state.json')
  }

  async load(): Promise<WindowState> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<WindowState>
      const width = Math.max(1100, Number(raw.width) || DEFAULT_STATE.width)
      const height = Math.max(680, Number(raw.height) || DEFAULT_STATE.height)
      const isVisible =
        typeof raw.x === 'number' &&
        typeof raw.y === 'number' &&
        screen.getAllDisplays().some((display) => {
          const area = display.workArea
          return (
            raw.x! + 120 >= area.x &&
            raw.y! + 80 >= area.y &&
            raw.x! < area.x + area.width &&
            raw.y! < area.y + area.height
          )
        })
      return {
        width,
        height,
        x: isVisible ? (raw.x as number) : DEFAULT_STATE.x,
        y: isVisible ? (raw.y as number) : DEFAULT_STATE.y,
        maximized: Boolean(raw.maximized)
      }
    } catch {
      return { ...DEFAULT_STATE }
    }
  }

  saveBounds(bounds: Rectangle, maximized: boolean): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const state: WindowState = { ...bounds, maximized }
      fs.mkdir(path.dirname(this.file), { recursive: true })
        .then(() => fs.writeFile(this.file, JSON.stringify(state), 'utf8'))
        .catch(() => undefined)
    }, 350)
  }
}
