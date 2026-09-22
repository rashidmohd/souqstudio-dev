import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Same helper and same name as apps/web, so components move between them. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
