import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useUIStore } from '@/store/useUIStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * First-launch informational panel explaining how JioTv Max works with
 * existing Jio mobile accounts before transitioning to the login screen.
 */
export function HowToUseModal(): JSX.Element | null {
  const open = useUIStore((state) => state.howToUseOpen)
  const closeHowToUse = useUIStore((state) => state.closeHowToUse)
  const openLogin = useUIStore((state) => state.openLogin)
  const setHasClearedHowToUse = useSettingsStore((state) => state.setHasClearedHowToUse)
  const user = useAuthStore((state) => state.user)

  // If already authenticated, dismiss immediately and never show login
  if (open && user) {
    setHasClearedHowToUse(true)
    closeHowToUse()
    return null
  }

  const handleGotIt = (): void => {
    setHasClearedHowToUse(true)
    closeHowToUse()
    const currentUser = useAuthStore.getState().user
    if (!currentUser) {
      setTimeout(() => {
        openLogin('Sign in with your JioTV number to start watching.')
      }, 150)
    }
  }

  return (
    <Modal
      open={open}
      bare
      dismissible={false}
      className="w-[440px] max-w-[94vw]"
      labelledBy="how-to-use-title"
    >
      <div className="overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[#0A0A0B] shadow-2xl">
        <div className="relative p-7">
          <span className="text-[11px] font-[600] uppercase tracking-[0.14em] text-[#E11D2E]">
            Welcome
          </span>

          <h2
            id="how-to-use-title"
            className="mt-1 font-sans text-[22px] font-[700] tracking-[-0.02em] text-[#F4F4F5]"
          >
            Before you begin
          </h2>

          <div className="mt-5 space-y-3.5">
            <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-4">
              <h3 className="font-sans text-[14.5px] font-[600] text-[#F4F4F5]">
                Standard Mobile Plans Work
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#A1A1A6]">
                No Smart TV or JioFiber subscription needed. Any regular Jio mobile recharge works at zero extra cost.
              </p>
            </div>

            <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-4">
              <h3 className="font-sans text-[14.5px] font-[600] text-[#F4F4F5]">
                Same Channels as Your Phone
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#A1A1A6]">
                Whatever live TV channels are available in your JioTV mobile account are instantly unlocked here on your PC.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            className="mt-6 w-full font-[600]"
            onClick={handleGotIt}
          >
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  )
}
