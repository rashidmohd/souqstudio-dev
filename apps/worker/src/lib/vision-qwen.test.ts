import { describe, expect, it } from 'vitest'
import { NotAnOfferCardError, UnreadableDesignError, interpretFirst } from './magic-prompt'
import { candidateObjects } from './vision-qwen'

/**
 * Recovering an answer from a reply that is not quite JSON. E8-07.
 *
 * **The interesting case here is a transcript, not an invention.** Qwen is asked
 * for JSON rather than constrained to it, and on the first live run against a
 * real key it produced `SELF_CORRECTED` below: a `notes` array with mismatched
 * quote characters, an abandoned fragment, and then the whole object again —
 * correct this time, and nested inside the broken one because that one never
 * closed. Its *answer* was right in both copies (`listRow`, which is what the
 * card was); only the first serialisation was malformed.
 *
 * Recovering it turns a wasted paid call into the right result. Refusing it
 * spends an owner's credits to punish the provider's formatting.
 *
 * The trap this file exists to pin: **the wreckage parses.** The mismatched
 * quotes turn half a sentence into an object key, so the outer object is
 * syntactically valid JSON carrying the right `structure` and a `notes` that is
 * a string. "First thing that parses" picks it. Only the schema can tell them
 * apart.
 */

/** Verbatim shape from the first live DashScope run. */
const SELF_CORRECTED = `{"isOfferCard":true,"structure":"listRow","ground":"surface","accent":"accent","outlined":false,"priceFrame":"tag","name":"Row card with boxed price tag","description":"Thumbnail at the left, name and spec across the middle.","notes":"Matched listRow: small packshot at the start, name and spec in the middle, price at the end of the line.","The price sits in an outlined box with a rounded deal tab on top, so priceFrame is tag rather than plain.','The struck-through old price and large new price both live inside that tag.','A thin rule runs across the foot of the card, but there is no border around the whole card, so outlined is false."
  	:	 "confidence"
 	, "high"
 	:
 	{"isOfferCard":true,"structure":"listRow","ground":"surface","accent":"accent","outlined":false,"priceFrame":"tag","name":"Row card with boxed price tag","description":"Thumbnail at the left, name and spec across the middle.","notes":["Matched listRow: small packshot at the start.","The price sits in an outlined box."],"confidence":"high"}
}`

const WELL_FORMED = JSON.stringify({
  isOfferCard: true,
  structure: 'burst',
  ground: 'surface',
  outlined: false,
  priceFrame: 'tag',
  name: 'Price burst card',
  description: '',
  notes: [],
  confidence: 'high',
})

describe('candidateObjects', () => {
  it('reads a plain object', () => {
    expect(candidateObjects('{"structure":"stacked"}')[0]).toEqual({ structure: 'stacked' })
  })

  it('reads an object inside a code fence', () => {
    // `json_object` mode is supposed to prevent this and does not.
    expect(candidateObjects('```json\n{"structure":"burst"}\n```')[0]).toEqual({
      structure: 'burst',
    })
  })

  it('finds the nested object a self-correcting reply left behind', () => {
    // The corrected copy is not a sibling of the broken one — it arrives inside
    // it, because the broken object never closed. Collecting only top-level
    // spans found one span, running first brace to last, and it was the wrong
    // one. Spans are collected at every depth now.
    const found = candidateObjects(SELF_CORRECTED)
    expect(found.length).toBeGreaterThan(1)
    expect(
      found.some((entry) => Array.isArray((entry as { notes?: unknown }).notes))
    ).toBe(true)
  })

  it('does not mistake a brace inside a string for the end of an object', () => {
    const withBrace = '{"description":"a price like {24.50} in a tag","structure":"ticket"}'
    expect(candidateObjects(withBrace)[0]).toEqual({
      description: 'a price like {24.50} in a tag',
      structure: 'ticket',
    })
  })

  it('offers nothing when there is no object to recover', () => {
    expect(candidateObjects('I am not able to read this image.')).toEqual([])
    expect(candidateObjects('{"unclosed": true')).toEqual([])
  })
})

describe('interpretFirst', () => {
  it('takes a well-formed reply', () => {
    expect(interpretFirst(candidateObjects(WELL_FORMED)).structure).toBe('burst')
  })

  it('picks the corrected copy out of a self-correcting reply', () => {
    /**
     * **The regression this whole file is for.** Both copies parse and both
     * carry `structure: "listRow"`, so a parse-first reading returns the
     * wreckage and looks like it worked — until `notes` reaches the block as a
     * string. The schema is what separates them.
     */
    const choice = interpretFirst(candidateObjects(SELF_CORRECTED))
    expect(choice.structure).toBe('listRow')
    expect(Array.isArray(choice.notes)).toBe(true)
    expect(choice.notes.length).toBe(2)
  })

  it('refuses when no candidate satisfies the schema', () => {
    // A structure the library does not have is still refused, however clean the
    // JSON around it was. Recovery is not leniency.
    expect(() => interpretFirst(candidateObjects('{"structure":"nonesuch"}'))).toThrow(
      UnreadableDesignError
    )
    expect(() => interpretFirst([])).toThrow(UnreadableDesignError)
  })

  it('passes a declined picture through as its own answer', () => {
    // Not an error to recover from — the model looked and said no.
    const declined = JSON.stringify({
      isOfferCard: false,
      structure: 'stacked',
      ground: 'surface',
      outlined: false,
      priceFrame: 'tag',
      name: 'Flyer page',
      description: '',
      notes: ['This is a whole page rather than one card.'],
      confidence: 'high',
    })
    expect(() => interpretFirst(candidateObjects(declined))).toThrow(NotAnOfferCardError)
  })
})
