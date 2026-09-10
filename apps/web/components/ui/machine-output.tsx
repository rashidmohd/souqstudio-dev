import * as React from 'react'

/**
 * The mark on anything a model authored.
 *
 * **A functional requirement, not decoration** — `souqstudio-design` → AI output
 * must be visibly marked. What SouqStudio generates does not stay on screen: a
 * generated cover or a matched offer card goes onto a flyer that reaches
 * thousands of a shop's customers, and the owner must never be unable to tell
 * which parts of that page a machine wrote.
 *
 * Machine fill, a 2px rule on the inline start, the label above. `sq-machine` in
 * the token file carries the fill and the rule together, so the two cannot drift
 * apart and the print stylesheet has one thing to override when colour is not
 * available.
 *
 * **Never a button, and never wrapping something the owner typed.** Both are
 * stated in the design system rather than left to judgement, because both are
 * easy to reach for: the treatment is a tinted block with a rule, which looks
 * like a callout, and a callout is a tempting place to put an action. It marks
 * provenance and nothing else — the moment it wraps the owner's own words it is
 * telling them something untrue about their own work.
 */
type MachineOutputProps = {
  /** Names what was generated: "Matched from your picture", "Generated cover". */
  label: string
  children: React.ReactNode
}

export function MachineOutput({ label, children }: MachineOutputProps) {
  return (
    <div className="sq-machine flex flex-col gap-2 rounded-block p-4">
      {/*
       * The label is the mark. It is `eyebrow` — mono, uppercase, small — for
       * the same reason a figure is mono: it reads as a stamp on the content
       * rather than as a heading the content belongs under.
       */}
      <span className="font-ui text-eyebrow uppercase tracking-wide text-machine-label">
        {label}
      </span>
      {children}
    </div>
  )
}
