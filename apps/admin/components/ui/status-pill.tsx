import { cn } from '@/lib/utils'

/**
 * Text always, never a bare coloured dot. souqstudio-design → Status pills.
 *
 * The tones are the Status table's, and nothing here invents one. `neutral` is
 * the Draft row and `quiet` is the Archived row; they are named for what they
 * mean rather than for their colour, so a screen asking for "archived" cannot
 * accidentally get the live green.
 */
type Tone = 'positive' | 'critical' | 'caution' | 'neutral' | 'quiet' | 'machine'

const TONES: Readonly<Record<Tone, string>> = {
  positive: 'bg-positive-bg text-positive-fg',
  critical: 'bg-critical-bg text-critical-fg',
  caution: 'bg-caution-bg text-caution-fg',
  neutral: 'bg-sand text-stone-700',
  quiet: 'bg-stone-100 text-stone-700',
  machine: 'bg-machine-fill text-machine-label',
}

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-px text-label font-medium',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
