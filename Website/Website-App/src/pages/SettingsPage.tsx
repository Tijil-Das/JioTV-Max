import { PageTransition, StateView } from '@/components/ui/StateView'
import { downloadLatestApp } from '@/lib/downloadApp'

/** Settings: Clean install prompt in web app. */
export function SettingsPage(): JSX.Element {
  return (
    <PageTransition>
      <div className="pt-[88px]">
        <StateView
          title="Install the JioTV Max app to explore more."
          actionLabel="Download JioTV Max App"
          onAction={downloadLatestApp}
        />
      </div>
    </PageTransition>
  )
}
