import { PageTransition, StateView } from '@/components/ui/StateView'
import { downloadLatestApp } from '@/lib/downloadApp'

/** Settings: Clean install prompt in web app. */
export function SettingsPage(): JSX.Element {
  return (
    <PageTransition className="flex-1 flex flex-col justify-center items-center min-h-[calc(100vh-100px)]">
      <div className="flex-1 flex flex-col items-center justify-center py-12 w-full">
        <StateView
          title="Install the JioTV Max app to explore more."
          actionLabel="Download JioTV Max App"
          onAction={downloadLatestApp}
        />
      </div>
    </PageTransition>
  )
}
