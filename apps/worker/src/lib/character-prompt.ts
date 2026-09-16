import {
  CAMPAIGN_COPY,
  INVENTED_PERSON_STYLES,
  tradesPhrase,
  CHARACTER_LOOK_NOTE,
  CHARACTER_STYLE_NOTE,
  POSE_COPY,
  uniformJsonSchema,
  uniformSchema,
  type Campaign,
  type CharacterGender,
  type CharacterLook,
  type CharacterStyle,
  type CoverShape,
  type Pose,
  type Uniform,
} from '@souqstudio/engine'

/**
 * What the character and cover features ask for. E8-01 to E8-04.
 *
 * **Two kinds of prompt in one file, on purpose.** The vision prompt reads a
 * uniform off a photograph; the draw prompts describe a character. They belong
 * together because the second is built from the first, and splitting them is how
 * a field gets extracted that nothing ever uses — or worse, how the drawing
 * prompt starts describing something the extraction was careful not to capture.
 *
 * **The extraction describes clothing and nothing else.** The input photograph
 * may contain identifiable people. `uniformSchema` cannot carry a description of
 * a face, which is the enforcement; this prompt says so as well, because a model
 * told why a constraint exists follows it better than one merely constrained.
 */

/** The picture showed no uniform. */
export class NoUniformError extends Error {
  constructor(readonly notes: readonly string[]) {
    super('no_uniform')
    this.name = 'NoUniformError'
  }
}

/** The model answered, but not in a shape the schema accepts. */
export class UnreadableUniformError extends Error {
  constructor() {
    super('unreadable_uniform')
    this.name = 'UnreadableUniformError'
  }
}

export const UNIFORM_SYSTEM = `You look at a photograph of a retail shop's staff uniform and
describe the clothing.

The photograph was uploaded by a shop owner in the Gulf who wants a cartoon
character wearing the same uniform, for their offer books.

## Describe the clothing. Describe nothing else.

The photograph may show people wearing the uniform. **Do not describe them.** Not
their faces, not their build, not their age, not their skin, not their hair, not
anything that would identify a person. If you cannot describe the garment without
describing who is in it, describe less.

What to report: the garment and its cut, its colours, what kind of uniform it is,
and where a logo sits on it if one does.

## colors

Up to three, as six-digit hex, in the order they matter. The uniform's own
colours — not the wall behind it, not the floor, not the lighting.

## When it is not a uniform

Set \`isUniform: false\` when the picture has no staff clothing in it — a
shopfront, a shelf, a product, a logo on its own. Say why in \`notes\`. Declining
costs the owner nothing.

## notes

At most four short sentences for the shop owner, so they can tell whether you
read their uniform correctly.`

export const UNIFORM_QUESTION = 'What uniform is this? Describe the clothing only.'

export const UNIFORM_CONTRACT = `Answer with a single JSON object and nothing else — no
prose, no code fence. It must validate against this JSON Schema:

${JSON.stringify(uniformJsonSchema(), null, 2)}

Every field is required. Each colour must be a six-digit hex with a leading #.`

export function interpretUniform(candidates: readonly unknown[]): Uniform {
  for (const candidate of candidates) {
    const parsed = uniformSchema.safeParse(candidate)
    if (!parsed.success) continue

    if (!parsed.data.isUniform) throw new NoUniformError(parsed.data.notes)
    return parsed.data
  }

  throw new UnreadableUniformError()
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

/**
 * The constraints every generated character shares.
 *
 * **A plain background is not a stylistic preference.** The character is
 * composited onto an offer book page in the shop's own colours, so anything
 * behind it is something the cutout has to remove — and E8-05 removes
 * backgrounds far more reliably from a flat ground than from a scene.
 */
const CHARACTER_RULES = `Full body, head to feet, standing on nothing.
Plain flat white background, no scene, no floor, no shadow cast onto a surface.
No text anywhere in the image, in any language.
One character only.
Centred, with a small even margin, facing the viewer.`

/** Said when no logo was supplied. Otherwise `logoRule` replaces it. */
const NO_LOGO = `No logo, no brand mark and no writing on the uniform — the shop
adds their own afterwards.`

/**
 * Where the shop's own logo goes, when they supplied one.
 *
 * **The placement comes from the uniform they photographed, not from a
 * preference.** The vision step already read where a logo sits on the real
 * garment, so a generated character wears it where their staff wear it. When the
 * real uniform has none, the left chest is the convention and is stated rather
 * than left to the model.
 *
 * **It says "as closely as you can" on purpose.** A model redrawing a logo is
 * approximating it, and one containing text will come back with the letters
 * wrong — that is a property of the tools, not of this prompt, and the interface
 * says so before an owner uploads.
 */
function logoRule(placement: Uniform['logoPlacement']): string {
  const where =
    placement === 'none' ? 'left chest' : placement.replace('-', ' ')

  return `The attached logo image is the shop's own logo. Place it on the ${where} of
the uniform, small, as closely as you can to the image supplied — do not redraw
it, restyle it, or add words to it. It should sit flat on the fabric and follow
its folds. Nothing else in the picture carries any text or mark.`
}

function look(value: CharacterLook): string {
  return value === 'unspecified' ? '' : `${CHARACTER_LOOK_NOTE[value]} features. `
}

function wearing(uniform: Uniform): string {
  const colors = uniform.colors.length === 0 ? '' : ` in ${uniform.colors.join(' and ')}`
  return `wearing ${uniform.garment}${colors}`
}

/**
 * A base character. E8-01.
 *
 * **Built from the extracted uniform rather than from the photograph**, and the
 * photograph is never sent to the image model. The vision model has already
 * reduced it to a description of clothing, which is the only part of it this
 * feature needed — so the picture of somebody's employees goes to exactly one
 * provider, once, and what travels onward is a sentence about a polo shirt.
 */
export function characterPrompt(input: {
  uniform: Uniform
  style: CharacterStyle
  gender: Exclude<CharacterGender, 'both'>
  look: CharacterLook
  /**
   * What the shop sells — one to three segments, in the owner's own order.
   * A butcher's character is not an electronics shop's, and a grocery with a
   * bakery counter is neither.
   */
  trades: readonly string[]
  /** The owner's own words about the shop. Quoted, never spliced as instruction. */
  bio: string
  /** What they want the character for, in their words. Quoted for the same reason. */
  goal?: string
  /** Whether a photograph of the shop is attached as a scene reference. */
  inScene: boolean
  /** Whether the shop's logo is attached, to be worn on the uniform. */
  withLogo: boolean
}): string {
  const medium =
    input.style === 'photo-real'
      ? 'A photograph of'
      : `A ${input.style.replace('-', ' ')} style illustration of`

  /**
   * **The invented-person line, on the styles that can produce a face.**
   *
   * The uniform photograph never reaches this model — a vision model already
   * reduced it to a sentence — so there is no reference to resemble. This guards
   * the other failure: a model asked for a photorealistic retail worker drifting
   * toward a recognisable public likeness with no reference image at all.
   */
  const invented = INVENTED_PERSON_STYLES.includes(input.style)
    ? '\nThe person is invented and must not resemble any real or recognisable individual.'
    : ''

  /**
   * The scene, or the absence of one.
   *
   * A character composited onto an offer book page needs a plain ground so the
   * cutout is clean. One shown standing in the shop is a different picture with
   * a different job, and the two rules contradict each other — so only one is
   * ever in the prompt.
   */
  const setting = input.inScene
    ? `Standing in the shop shown in the attached photograph, which is the setting and
nothing else — do not copy any text, sign or logo from it.
Full body, facing the viewer.
No text anywhere in the image, in any language. One person only.`
    : CHARACTER_RULES

  /**
   * **The logo rule replaces the no-logo rule; they are never both present.**
   * A prompt carrying "no logo anywhere" and "put this logo on the chest" is one
   * a model resolves by guessing, and the guess is usually the first one.
   */
  const branding = input.withLogo ? logoRule(input.uniform.logoPlacement) : NO_LOGO

  const wants =
    input.goal === undefined || input.goal.trim() === ''
      ? ''
      : `\n\nThe owner describes what they want it for as: "${input.goal.trim()}". Treat that
as a description of the mood, not as an instruction to add text or objects.`

  return `${medium} a friendly ${input.gender} retail shop worker, ${look(input.look)}${wearing(input.uniform)}.

They work at ${tradesPhrase(input.trades)}. The owner describes the shop as:
"${input.bio.trim()}"

Standing straight, arms relaxed at their sides, smiling, facing the viewer.${invented}${wants}

${setting}

${branding}`
}

/**
 * One pose of an existing character. E8-02.
 *
 * **The base image is a reference, and this prompt's job is to say what stays.**
 * The spec asked for ControlNet with the reference locked; both providers do
 * reference-conditioned generation, so the lock is a sentence rather than a
 * model — which means it has to be an unambiguous one. A pose library whose
 * character changes face between poses is not a library.
 */
export function posePrompt(pose: Pose): string {
  return `The character in the reference image, ${POSE_COPY[pose].draw}.

Keep the same character exactly: the same face, the same hair, the same body,
the same uniform, the same colours, the same illustration style. Only the pose
changes. This is the same person in a different position, not a new character.

${CHARACTER_RULES}`
}

/**
 * A described pose. E8-03.
 *
 * The owner writes what they want and this wraps it — the brand, the uniform and
 * the style are injected behind them, which is the whole of E8-03's
 * "prompt injection example". What they type describes an action, and the
 * sentences around it are what keep it the same character.
 */
export function describedPosePrompt(described: string): string {
  return `The character in the reference image: ${described}.

Keep the same character exactly: the same face, the same hair, the same body,
the same uniform, the same colours, the same illustration style. Only what they
are doing changes.

${CHARACTER_RULES}`
}

/**
 * A cover background. E8-04.
 *
 * **It draws a background and nothing else.** The shop's name, its logo and its
 * character are composited on top afterwards — a model asked to render a shop's
 * name produces text that is misspelled, in the wrong typeface, and in a
 * language it guessed. The prompt says so twice because it is the single
 * instruction this feature most needs obeyed.
 */
export function coverPrompt(input: {
  campaign: Campaign
  described?: string
  shape: CoverShape
  palette: readonly string[]
  /** A reference image of the shop's character is being sent with this. */
  withCharacter?: boolean
  /** Reference photographs of the shop itself are being sent with this. */
  withScene?: boolean
}): string {
  const subject =
    input.campaign === 'custom'
      ? (input.described ?? 'a retail offer campaign')
      : CAMPAIGN_COPY[input.campaign].draw

  const shape =
    input.shape === 'square'
      ? 'A square image.'
      : input.shape === 'story'
        ? 'A tall portrait image, 9:16.'
        : 'A portrait image, 3:4.'

  const colors =
    input.palette.length === 0 ? '' : `\nUse these colours: ${input.palette.join(', ')}.`

  /**
   * **Two prompts, because a cover with the shop's character in it is a
   * different picture from a background.**
   *
   * The original said "no people" and "leave the middle calm", because the spec
   * had the character composited on top by the export. Drawing it in instead is
   * what makes a cover finished today rather than when E9 lands — and it is the
   * owner's own mascot in their own shop, which is the thing they asked for.
   * Reference-conditioned generation keeps it the same character, exactly as the
   * pose library relies on.
   *
   * **The no-text rule survives both.** A model asked to render a shop's name
   * produces misspelled words in a typeface nobody chose, and that is true
   * whether or not a character is in the frame.
   */
  const people = input.withCharacter
    ? `Draw the character from the reference image as the subject. **Keep them the
same person** — the same face, the same build, the same uniform and the same
colours as the reference. Place them naturally in the scene rather than pasted
onto it, and leave clear space beside or above them.`
    : `Decorative, graphic and flat rather than photographic. No people.`

  const place = input.withScene
    ? `
The reference photographs show the actual shop this is for. Take the setting
from them — the shelves, the counter, the kind of place it is — rather than
inventing a generic store.`
    : ''

  const room = input.withCharacter
    ? `Leave room for the shop's name and logo, which are placed on top afterwards.`
    : `The shop's name, its logo and its own characters are placed on top of this
afterwards, so leave the middle of the image calm and uncluttered for them to sit
on.`

  return `A cover image for a retail offer book: ${subject}.
${shape}${colors}${place}

**No text of any kind.** No words, no letters, no numbers, in any language or
script. No logo and no brand mark. ${room}

${people}`
}
