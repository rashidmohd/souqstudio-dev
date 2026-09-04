'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { BrandColor, BrandKit, LogoStatus, TextStyle } from '@souqstudio/types'
import { ROLE_SLOT, type FontRole } from '@/lib/brand-fonts'

/**
 * The brand kit as the setup wizard and its live preview see it. E1-04, E4-02.
 *
 * Zustand rather than Context: the preview re-renders on every colour-picker
 * movement, and Context re-renders every consumer under the provider on each
 * change. Same reasoning as the editor store — see the stack notes in
 * souqstudio-technical.
 *
 * **This store is the preview's source of truth, not the server's.** Colour
 * changes land here immediately so the preview tracks the picker with no
 * network in the loop; the wizard persists to the API at step boundaries. A
 * failed save must therefore not be silent — see `saveError`.
 */

type BrandState = {
  kit: BrandKit
  logoUrl: string | null
  shopName: string
  /** Whether a save is in flight, so the step buttons can wait on it. */
  saving: boolean
  saveError: string | null

  hydrate: (input: { kit: BrandKit; logoUrl: string | null; shopName: string }) => void
  setColor: (slot: 'primaryColor' | 'secondaryColor' | 'accentColor', hex: string) => void
  setColors: (colors: Pick<BrandKit, 'primaryColor' | 'secondaryColor' | 'accentColor'>) => void
  setPalette: (palette: BrandColor[]) => void
  setFont: (role: FontRole, family: string) => void
  setTextStyles: (styles: TextStyle[]) => void
  setLogo: (input: { logoUrl: string; suggestedColors: string[]; logoStatus: LogoStatus }) => void
  setLogoStatus: (status: LogoStatus) => void
  setSaving: (saving: boolean) => void
  setSaveError: (message: string | null) => void
}

/**
 * Fallbacks for the preview before a logo exists. Charcoal is the product's own
 * primary action colour, so an untouched preview looks deliberate rather than
 * broken — and it is replaced the moment a logo lands.
 */
export const DEFAULT_COLORS = {
  primaryColor: '#1F1F1D',
  secondaryColor: '#4A4A46',
  accentColor: '#0B63CE',
} as const

export const useBrandStore = create<BrandState>()(
  immer((set) => ({
    kit: {},
    logoUrl: null,
    shopName: '',
    saving: false,
    saveError: null,

    hydrate: ({ kit, logoUrl, shopName }) =>
      set((state) => {
        state.kit = kit
        state.logoUrl = logoUrl
        state.shopName = shopName
      }),

    setColor: (slot, hex) =>
      set((state) => {
        state.kit[slot] = hex
      }),

    setColors: (colors) =>
      set((state) => {
        Object.assign(state.kit, colors)
      }),

    setPalette: (palette) =>
      set((state) => {
        state.kit.palette = palette
        // The first three mirror into the old fields so every existing read —
        // the logo suggestions, the contrast checks, `previewColors` — keeps
        // working while the palette becomes the real store.
        state.kit.primaryColor = palette[0]?.hex
        state.kit.secondaryColor = palette[1]?.hex
        state.kit.accentColor = palette[2]?.hex
      }),

    setFont: (role, family) =>
      set((state) => {
        state.kit[ROLE_SLOT[role]] = family
      }),

    setTextStyles: (styles) =>
      set((state) => {
        state.kit.textStyles = styles
      }),

    setLogo: ({ logoUrl, suggestedColors, logoStatus }) =>
      set((state) => {
        state.logoUrl = logoUrl
        state.kit.suggestedColors = suggestedColors
        state.kit.logoStatus = logoStatus
        // Only seed the slots that are still empty. Re-uploading a logo must
        // not throw away a colour the owner has already adjusted by hand.
        if (!state.kit.primaryColor) state.kit.primaryColor = suggestedColors[0]
        if (!state.kit.secondaryColor) state.kit.secondaryColor = suggestedColors[1]
        if (!state.kit.accentColor) state.kit.accentColor = suggestedColors[2]
      }),

    setLogoStatus: (status) =>
      set((state) => {
        state.kit.logoStatus = status
      }),

    setSaving: (saving) =>
      set((state) => {
        state.saving = saving
      }),

    setSaveError: (message) =>
      set((state) => {
        state.saveError = message
      }),
  }))
)

/** The colours the preview should paint with right now, defaults included. */
export function previewColors(kit: BrandKit) {
  return {
    primary: kit.primaryColor ?? DEFAULT_COLORS.primaryColor,
    secondary: kit.secondaryColor ?? DEFAULT_COLORS.secondaryColor,
    accent: kit.accentColor ?? DEFAULT_COLORS.accentColor,
  }
}
