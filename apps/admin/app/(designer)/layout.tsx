import { requireAdmin } from '@/lib/admin-auth'

/**
 * Screens that take the whole window. Today, the block designer.
 *
 * **Outside `(panel)` because the panel pads its content and the designer
 * cannot be padded.** The canvas sizes itself to the viewport, and a rail plus
 * padding around it is a canvas that scrolls inside a page that scrolls. The
 * designer carries its own way back to the console in its header.
 *
 * The session is read here as well as on the page: a layout that renders
 * nothing sensitive still should not render for nobody.
 */
export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
