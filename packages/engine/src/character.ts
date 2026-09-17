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

/**
 * The occasions a cover can be for.
 *
 * **An occasion, not a prompt.** A shop owner picks the week they are having;
 * the art direction for it lives in `CAMPAIGN_COPY` and the look lives in
 * `COVER_STYLES`, so the two multiply rather than each needing its own entry.
 * Six occasions and six styles is thirty-six covers to ask for, written once.
 *
 * Ordered by how often a grocery in this market actually runs one.
 */
export const CAMPAIGNS = [
  'weekend',
  'fresh',
  'ramadan',
  'eid',
  'clearance',
  'back-to-school',
  'national-day',
  'summer',
  'winter',
  'new-year',
  'opening',
  'custom',
] as const
export type Campaign = (typeof CAMPAIGNS)[number]

/**
 * What each occasion is *of*, in enough words to be drawable.
 *
 * **The first version of this was one thin clause each** — "a bright weekend
 * sale, energetic and simple" — and it produced exactly what that describes:
 * generic wallpaper. A diffusion model given an adjective returns the average of
 * everything that adjective has ever labelled. What it needs is subject matter:
 * objects, a season, a light, a mood with something in it.
 *
 * So each one names things that can be drawn. None of them names a *style* —
 * that is `COVER_STYLES`, and keeping them apart is what makes the two multiply.
 *
 * **Every noun here is goods on a display, never something a person wears or
 * drinks.** The first draft said "a backpack" and "condensation on glass", and
 * on a cover carrying the shop's character the model put the backpack on the
 * assistant and had them drinking the juice — because those are the obvious
 * things to do with a backpack and a glass. `coverPrompt` forbids it as well,
 * but a prohibition arguing with the copy is a fight it can lose. Describe a
 * display and there is nothing to dress anybody in.
 */
export const CAMPAIGN_COPY: Readonly<Record<Campaign, { label: string; draw: string }>> = {
  weekend: {
    label: 'Weekend sale',
    draw: 'a weekend grocery sale — a generous display of everyday food, bread, fruit and packaged staples stacked and arranged for sale, in bright late-morning light, cheerful and abundant',
  },
  fresh: {
    label: 'Fresh produce',
    draw: 'fresh produce — crates of vegetables and fruit stacked on a market display, herbs, leaves still wet, greens and reds against a clean ground, a market-morning feeling',
  },
  ramadan: {
    label: 'Ramadan',
    draw: 'Ramadan — bowls of dates and nuts set out on a table, hanging lanterns, a crescent and stars, deep indigo and gold, the light of dusk; calm, generous and reverent rather than loud',
  },
  eid: {
    label: 'Eid',
    draw: 'Eid — trays of sweets and wrapped gifts arranged for sale, geometric ornament, hanging decoration, gold on a rich colour, warm and festive',
  },
  clearance: {
    label: 'Clearance',
    draw: 'a clearance sale — shelves and pallets of stacked stock, strong diagonal energy, hot reds and yellows, the visual language of a last-chance price',
  },
  'back-to-school': {
    label: 'Back to school',
    draw: 'back to school — stacks of notebooks, pots of pencils, lunch boxes and school supplies arranged on a display table, bright primary colours on a clean ground',
  },
  'national-day': {
    label: 'National day',
    draw: 'a national day celebration — bunting and ribbon strung above a display, flags on stands, patriotic colour, proud and warm',
  },
  summer: {
    label: 'Summer',
    draw: 'high summer — bottles of cold drinks in a tub of ice, watermelon and citrus stacked on a chilled display, bright sun and a pool-blue ground',
  },
  winter: {
    label: 'Winter',
    draw: 'winter — jars of warm spices, packets of tea and folded blankets set out on a display, low amber light against a cool blue evening, cosy and still',
  },
  'new-year': {
    label: 'New year',
    draw: 'a new year — confetti and streamers falling over a display of goods, midnight blue and metallic gold, optimistic and celebratory',
  },
  opening: {
    label: 'Grand opening',
    draw: 'a grand opening — a ribbon strung across new shelves, balloons tied at the ends, confetti in the air, proud and welcoming',
  },
  custom: { label: 'Something else', draw: '' },
}

/**
 * How it is drawn, as against what it is of.
 *
 * **The axis the first build did not have**, and the reason its covers looked
 * basic: the prompt hard-coded "decorative, graphic and flat", which is one
 * house style and the blandest of the six. A retail cover is as likely to be a
 * photograph, a paper cut-out or a sunburst as it is to be flat vector.
 *
 * The six are the archetypes a promotional cover actually uses. `photographic`
 * is first because it is what a shop owner means by "a nice cover", and because
 * it is the one that makes their generated character look like it belongs
 * somewhere rather than floating on a pattern.
 */
export const COVER_STYLES = [
  'photographic',
  'flat-graphic',
  'burst',
  'paper-craft',
  'painterly',
  'minimal',
] as const
export type CoverStyle = (typeof COVER_STYLES)[number]

export const COVER_STYLE_COPY: Readonly<
  Record<CoverStyle, { label: string; note: string; draw: string }>
> = {
  photographic: {
    label: 'Photographic',
    note: 'Looks like a photo taken in the shop',
    draw: 'A real photograph taken inside the shop, not a studio set and not a stock image: the shop\'s own overhead lighting, real shelves and fittings receding out of focus behind, natural unforced colour, a shallow depth of field. It should look like somebody took it on the shop floor that morning — slightly candid, the person at ease rather than posed.',
  },
  'flat-graphic': {
    label: 'Flat graphic',
    note: 'Bold vector shapes, no shading',
    draw: 'A flat vector illustration: bold simple shapes, no gradients and no shading, confident blocks of colour with clean edges, in the manner of a modern poster.',
  },
  burst: {
    label: 'Sunburst',
    note: 'Radiating rays, the classic sale look',
    draw: 'A radial sunburst ground: rays of alternating colour radiating from behind the subject, a halftone dot texture over them, the classic loud language of a sale poster.',
  },
  'paper-craft': {
    label: 'Paper cut',
    note: 'Layered cut paper with soft shadow',
    draw: 'Layered cut-paper craft: shapes cut from coloured paper stacked in shallow layers, each casting a soft short shadow on the one beneath, matte and tactile.',
  },
  painterly: {
    label: 'Painted',
    note: 'Gouache brushwork, warm and handmade',
    draw: 'A gouache painting: visible brushwork, slightly uneven edges, warm handmade texture, the look of an illustrated market poster.',
  },
  minimal: {
    label: 'Minimal',
    note: 'One colour, mostly empty',
    draw: 'Minimal and restrained: one dominant colour field, a single small subject, a great deal of empty space, nothing decorative at all.',
  },
}

/** How many cover options one generation returns. E8-04: three. */
export const COVER_VARIATIONS = 3

/** The shapes a cover is generated at, matching the book's output format. */
/**
 * The proportions a cover can be drawn at.
 *
 * **Six rather than three, because "portrait" was doing three jobs.** A 4:5
 * Instagram post, a 3:4 leaflet and an A4 page are all portrait and none of them
 * crops cleanly into the others — a cover drawn at 3:4 and placed on an A4 page
 * loses a centimetre off two edges under `fit: 'cover'`, which is exactly where
 * the shop's name was going to sit.
 *
 * Ordered widest to tallest, which is the order a picker should offer them in.
 */
export const COVER_SHAPES = ['wide', 'square', 'post', 'portrait', 'a4', 'story'] as const
export type CoverShape = (typeof COVER_SHAPES)[number]

export const COVER_SHAPE_NOTE: Readonly<Record<CoverShape, string>> = {
  wide: 'Wide, for a banner or a screen',
  square: 'Square, for an Instagram post',
  post: 'Portrait post, for Instagram',
  portrait: 'Portrait, for a leaflet',
  a4: 'A4, for a printed page',
  story: 'Tall, for a story or a reel',
}

/**
 * The ratio each shape is, as a model is told it and as a browser lays it out.
 *
 * **`label` goes in the prompt.** Naming the ratio is what actually gets an
 * image back at that ratio; "a tall portrait image" is a description a model
 * satisfies approximately, "9:16" is a number.
 *
 * `aspect` is width ÷ height, which is what `shapeFor` compares against a page
 * and what a thumbnail's `aspect-ratio` uses.
 */
export const COVER_SHAPE_RATIO: Readonly<
  Record<CoverShape, { label: string; css: string; aspect: number }>
> = {
  wide: { label: '16:9', css: '16 / 9', aspect: 16 / 9 },
  square: { label: '1:1', css: '1 / 1', aspect: 1 },
  post: { label: '4:5', css: '4 / 5', aspect: 4 / 5 },
  portrait: { label: '3:4', css: '3 / 4', aspect: 3 / 4 },
  // ISO 216: every A size is 1:√2, so this one number covers A4, A5 and A3.
  a4: { label: '1:1.414 (A4)', css: '1 / 1.414', aspect: 1 / 1.414 },
  story: { label: '9:16', css: '9 / 16', aspect: 9 / 16 },
}
