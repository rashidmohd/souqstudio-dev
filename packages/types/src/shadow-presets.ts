/**
 * Product shadow presets — the numbers, in one place. E14 §2.4.
 *
 * **Here for the same reason `catalog-image-keys` is here**: three sides have to
 * agree about them. The card designer offers the names, the composer decides
 * which variant a card asks for, and the worker renders the pixels — and a
 * second copy of these numbers is how a preview stops matching what prints.
 *
 * **Four names, not eight sliders.** The shadow lab exists so these are chosen
 * once. A shop owner picking a shadow for a flyer is choosing a look, and
 * `squash` is not a look. It is also what keeps the rendered variants
 * countable: a free-form radius would mean re-rendering every product in a book
 * on every nudge of a slider.
 *
 * **Every value is a fraction of the image's shorter edge**, so one preset looks
 * the same on a 400px thumbnail and a 3000px packshot. The comment on each gives
 * the pixel value the lab tuned at, against a 369px render, so the two can be
 * compared without re-deriving the arithmetic.
 *
 * **`blur` is a Gaussian standard deviation**, matching `sharp.blur(sigma)`. A
 * preview that blurs by some other definition of σ — a radius, say — is out by a
 * constant that looks right on screen and wrong on paper. That relationship is
 * pinned by a test rather than assumed.
 */

/** What a block may ask for. `none` is the absence of the field, not a member. */
export type ShadowPreset = 'soft-drop' | 'hard-drop' | 'contact' | 'grounded'

export interface DropSpec {
  /** Gaussian σ, as a fraction of the shorter edge. */
  blur: number
  offsetX: number
  offsetY: number
  opacity: number
}

export interface ContactSpec {
  blur: number
  opacity: number
  /** Ellipse height as a fraction of the product's own height. Lower is flatter. */
  squash: number
  /** Ellipse half-width as a fraction of the product's own width. */
  spread: number
}

export interface ShadowPresetSpec {
  drop?: DropSpec
  contact?: ContactSpec
  /**
   * Transparent margin added on every side, as a fraction of the shorter edge.
   *
   * **Generous on purpose.** A Gaussian reaches about three σ, and the offset
   * is on top of that; a clipped shadow cuts off in a straight line and there
   * is no recovering it once the object is written. It costs canvas area — at
   * 0.34 the stored variant is about 2.8× the pixels of the cutout, which is
   * the 369×369 → 619×619 the lab reports.
   */
  pad: number
}

const REFERENCE_EDGE = 369

export const SHADOW_PRESET_SPECS: Record<ShadowPreset, ShadowPresetSpec> = {
  /** σ18, y+14, 0.32 at 369px. The default a card gets when it asks for one. */
  'soft-drop': {
    drop: {
      blur: 18 / REFERENCE_EDGE,
      offsetX: 0,
      offsetY: 14 / REFERENCE_EDGE,
      opacity: 0.32,
    },
    pad: 0.34,
  },
  /**
   * σ6, y+8, 0.35. Crisp rather than soft — the look a discount flyer wears,
   * and the one that survives being printed on newsprint, where a wide soft
   * gradient turns into a smudge.
   */
  'hard-drop': {
    drop: {
      blur: 6 / REFERENCE_EDGE,
      offsetX: 0,
      offsetY: 8 / REFERENCE_EDGE,
      opacity: 0.35,
    },
    pad: 0.34,
  },
  /** The ellipse alone: the product sits on a surface rather than floating. */
  contact: {
    contact: { blur: 14 / REFERENCE_EDGE, opacity: 0.3, squash: 0.1, spread: 0.46 },
    pad: 0.34,
  },
  /**
   * Both, and the most physically plausible of the four. A lighter drop than
   * `soft-drop` because the contact ellipse is already carrying the weight.
   */
  grounded: {
    drop: {
      blur: 20 / REFERENCE_EDGE,
      offsetX: 4 / REFERENCE_EDGE,
      offsetY: 10 / REFERENCE_EDGE,
      opacity: 0.22,
    },
    contact: { blur: 14 / REFERENCE_EDGE, opacity: 0.3, squash: 0.1, spread: 0.46 },
    pad: 0.34,
  },
}

/**
 * Every preset name, for a picker or a schema to iterate rather than restate.
 *
 * A literal list is how a fifth preset gets added here and stays invisible in
 * the designer — the same defect the binding picker had before it was built
 * from the vocabulary.
 */
export const SHADOW_PRESETS = Object.keys(SHADOW_PRESET_SPECS) as ShadowPreset[]

/** Whether a string names a preset this product knows. */
export function isShadowPreset(value: string): value is ShadowPreset {
  return Object.prototype.hasOwnProperty.call(SHADOW_PRESET_SPECS, value)
}
