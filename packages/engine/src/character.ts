import * as z from 'zod/v4'

/**
 * Characters, poses and covers — what a model may decide. E8-01 to E8-04.
 *
 * **The vocabulary in the engine, because two processes need it**, exactly as
 * `magic.ts` and `brand-direction.ts` argue: the worker turns these into prompts
 * and validates replies against them, the web app renders the pickers and reads
 * the results back. One definition, or a picker offers a style the worker cannot
 * draw.
 *
 * **Nothing here draws.** Unlike `logo-mark.ts`, which assembles an SVG because
 * a logo can be assembled, these four features genuinely need a model that makes
 * pixels — which is why they waited for a provider decision and the logo did
 * not. What this module owns is the closed set of things that may be *asked
 * for*, so that a character is one of four styles rather than whatever a free
 * prompt produced.
 */

// ─── Characters ───────────────────────────────────────────────────────────────

export const CHARACTER_STYLES = [
  'cartoon',
  'semi-realistic',
  'flat',
  'mascot',
  'photo-real',
] as const
export type CharacterStyle = (typeof CHARACTER_STYLES)[number]

export const CHARACTER_STYLE_NOTE: Readonly<Record<CharacterStyle, string>> = {
  cartoon: 'Friendly and drawn, with clear outlines. The safe choice for a grocery.',
  'semi-realistic': 'Closer to a photograph, still illustrated. Pharmacies and electronics.',
  flat: 'Flat colour, no shading, very few lines. Modern and prints cheaply.',
  mascot: 'A bold character with a big head and simple shapes. Reads at a distance.',
  'photo-real': 'A photograph of a shop worker, not a drawing. An invented person, never one of your staff.',
}

/**
 * **`photo-real` is a photograph of somebody who does not exist, and that is
 * structural rather than a promise.**
 *
 * The uniform photograph never reaches the image model at all: a vision model
 * reduces it to a sentence about clothing, and that sentence is what is drawn
 * from. There is no path by which a real employee's face could be conditioned on
 * — not because a prompt asks for that, but because the picture is not in the
 * request. Anyone changing the character job should understand that this is the
 * property being preserved, and that sending the photograph onward would quietly
 * end it.
 *
 * The style still carries its own warning in the prompt, because a model asked
 * for a photorealistic retail worker can drift toward a recognisable public
 * likeness without any reference image at all.
 */
export const INVENTED_PERSON_STYLES: readonly CharacterStyle[] = ['photo-real', 'semi-realistic']

/** How many extra angles of the uniform may be sent to the vision step. */
export const MAX_UNIFORM_ANGLES = 3

/** What the owner wants the character for. Free text, quoted as data. */
export const MAX_GOAL = 200

/**
 * Who the character is, in the sense the spec means: "nationality (drives facial
 * features and skin tone naturally)".
 *
 * **A closed list, and a deliberately coarse one.** The spec's phrasing invites
 * a free-text nationality field, and a free-text field here is a prompt that
 * will eventually carry something this product should not be generating people
 * from. These are broad regional descriptions of the people who actually work in
 * Gulf retail, which is what the field was for, and `unspecified` is first
 * because it is a legitimate answer and should not feel like a refusal to
 * choose.
 */
export const CHARACTER_LOOKS = [
  'unspecified',
  'gulf-arab',
  'levantine-arab',
  'south-asian',
  'east-asian',
  'east-african',
  'north-african',
] as const
export type CharacterLook = (typeof CHARACTER_LOOKS)[number]

export const CHARACTER_LOOK_NOTE: Readonly<Record<CharacterLook, string>> = {
  unspecified: 'Let the model decide. Often the best answer for a mascot.',
  'gulf-arab': 'Gulf Arab',
  'levantine-arab': 'Levantine Arab',
  'south-asian': 'South Asian',
  'east-asian': 'East Asian',
  'east-african': 'East African',
  'north-african': 'North African',
}

export const CHARACTER_GENDERS = ['male', 'female', 'both'] as const
export type CharacterGender = (typeof CHARACTER_GENDERS)[number]

/** How many variations one character generation returns. E3 prices it at four. */
export const CHARACTER_VARIATIONS = 4

/**
 * What a vision model reads off a photograph of a uniform.
 *
 * **It describes clothing and nothing else.** The input is a picture that may
 * contain identifiable people, and the only thing this product has any business
 * extracting from it is what they are wearing — which is what the character is
 * built from. A schema that cannot carry a description of a face is the
 * enforcement of that, rather than an instruction in a prompt that a model may
 * or may not follow.
 */
export const uniformSchema = z.object({
  /** False when the picture shows no uniform — an empty rail, a shopfront. */
  isUniform: z.boolean(),
  /** "Dark green polo shirt with a white collar". Clothing only. */
  garment: z.string().trim().max(160),
  type: z.enum(['apron', 'polo', 'shirt', 'vest', 'coat', 'formal', 'other']),
  /** The uniform's own colours, as the model saw them. Hex, at most three. */
  colors: z.array(z.string().trim().regex(/^#[0-9a-fA-F]{6}$/)).max(3),
  logoPlacement: z.enum(['none', 'left-chest', 'right-chest', 'centre', 'sleeve', 'back']),
  /** Written for the owner, so they can tell whether we read their uniform. */
  notes: z.array(z.string().trim().min(1).max(200)).max(4),
})

export type Uniform = z.infer<typeof uniformSchema>

export function uniformJsonSchema(): unknown {
  return z.toJSONSchema(uniformSchema)
}

// ─── Poses ────────────────────────────────────────────────────────────────────

export const POSES = [
  'waving',
  'holding',
  'announcing',
  'thumbs-up',
  'celebrating',
  'speech',
  'running',
] as const
export type Pose = (typeof POSES)[number]

/** The label an owner sees, and what the pose is for. E8-02's table. */
export const POSE_COPY: Readonly<Record<Pose, { label: string; use: string; draw: string }>> = {
  waving: {
    label: 'Waving',
    use: 'Cover page, landing image',
    draw: 'waving with one hand raised, welcoming, facing forward',
  },
  holding: {
    label: 'Holding a product',
    use: 'Beside a featured product',
    draw: 'holding a generic grocery product at chest height with both hands, looking at the viewer',
  },
  announcing: {
    label: 'Announcing',
    use: 'Sale announcements, banners',
    draw: 'holding a megaphone raised to one side, mouth open, announcing',
  },
  'thumbs-up': {
    label: 'Thumbs up',
    use: 'Best price badge, approval',
    draw: 'giving a thumbs up with one hand, smiling, facing forward',
  },
  celebrating: {
    label: 'Celebrating',
    use: 'Festive and seasonal offers',
    draw: 'both arms raised in celebration, delighted',
  },
  speech: {
    label: 'With a speech bubble',
    use: 'Custom text callouts',
    draw: 'gesturing to one side with an open palm, as if presenting text placed beside them',
  },
  running: {
    label: 'Running',
    use: 'Urgency, limited time',
    draw: 'running to one side in a hurry, leaning forward, looking at the viewer',
  },
}

/** How many variations one pose generation returns. E8-02: two. */
export const POSE_VARIATIONS = 2

// ─── Covers ───────────────────────────────────────────────────────────────────

export const CAMPAIGNS = [
  'weekend',
  'ramadan',
  'eid',
  'back-to-school',
  'clearance',
  'custom',
] as const
export type Campaign = (typeof CAMPAIGNS)[number]

export const CAMPAIGN_COPY: Readonly<Record<Campaign, { label: string; draw: string }>> = {
  weekend: { label: 'Weekend sale', draw: 'a bright weekend sale, energetic and simple' },
  ramadan: {
    label: 'Ramadan special',
    draw: 'Ramadan — lanterns, crescent and star motifs, deep blues and golds, calm and generous rather than loud',
  },
  eid: {
    label: 'Eid offers',
    draw: 'Eid — celebratory, warm, generous, with festive geometric ornament',
  },
  'back-to-school': {
    label: 'Back to school',
    draw: 'back to school — books, pencils, bags, bright primary colours',
  },
  clearance: { label: 'Clearance', draw: 'a clearance sale, urgent and bold' },
  custom: { label: 'Something else', draw: '' },
}

/** How many cover options one generation returns. E8-04: three. */
export const COVER_VARIATIONS = 3

/** The shapes a cover is generated at, matching the book's output format. */
export const COVER_SHAPES = ['square', 'portrait', 'story'] as const
export type CoverShape = (typeof COVER_SHAPES)[number]

export const COVER_SHAPE_NOTE: Readonly<Record<CoverShape, string>> = {
  square: 'Square, for an Instagram post',
  portrait: 'Portrait, for a catalog or leaflet',
  story: 'Tall, for a story',
}
