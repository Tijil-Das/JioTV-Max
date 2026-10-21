import { useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { PageTransition, StateView } from '@/components/ui/StateView'

export function NotFoundPage(): JSX.Element {
  const navigate = useNavigate()
  return (
    <PageTransition>
      <div className="pt-[88px]">
        <StateView
          icon={<Compass className="h-7 w-7" />}
          title="This page is off air"
          description="The address does not match anything in StreamDeck. Head back to the front page and pick a channel."
          actionLabel="Back home"
          onAction={() => navigate('/')}
          secondaryLabel="Open the guide"
          onSecondary={() => navigate('/guide')}
        />
      </div>
    </PageTransition>
  )
}
