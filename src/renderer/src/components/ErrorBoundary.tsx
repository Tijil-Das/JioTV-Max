import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Button } from '@/components/ui/Button'

interface State {
  error: Error | null
}

/** Catches renderer crashes and offers a safe reload instead of a blank window. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only — no remote reporting, no tokens in logs.
    // console.error('StreamDeck renderer error:', error.message, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center bg-bg-base px-8">
        <div className="glass max-w-[520px] rounded-panel p-8 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-display text-[15px] font-semibold text-white">
              JioTv <span className="text-[var(--red)]">Max</span>
            </span>
          </div>
          <span className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-[19px] font-semibold text-white">
            The interface hit an unexpected error
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Your account and settings are safe. Reload the window to continue watching.
          </p>
          <Button
            variant="primary"
            className="mt-6"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => window.location.reload()}
          >
            Reload JioTv Max
          </Button>
          <p className="mt-4 break-words text-[12px] text-text-secondary">{this.state.error.message}</p>
        </div>
      </div>
    )
  }
}
