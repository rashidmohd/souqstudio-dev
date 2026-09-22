import { describe, expect, it } from 'vitest'
import { clothingWords, promptSchema } from './prompt-schema'

const valid = {
  slug: 'produce-aisle',
  label: 'In the vegetable section',
  hint: 'Setting out crates of fresh produce',
  scene:
    'In the fresh produce section, at the vegetable beds. The person is setting a crate of tomatoes down onto the display. Bright cool overhead light.',
  person: 'staff' as const,
  group: 'everyday' as const,
  sortOrder: 20,
  isActive: true,
}

describe('promptSchema', () => {
  it('accepts a real scene', () => {
    expect(promptSchema.safeParse(valid).success).toBe(true)
  })

  it('refuses an adjective wearing a full stop', () => {
    const result = promptSchema.safeParse({ ...valid, scene: 'A weekend sale, energetic.' })
    expect(result.success).toBe(false)
  })

  it('refuses a slug with spaces or capitals, which would break the picker', () => {
    expect(promptSchema.safeParse({ ...valid, slug: 'Produce Aisle' }).success).toBe(false)
    expect(promptSchema.safeParse({ ...valid, slug: 'produce_aisle' }).success).toBe(false)
  })

  it('stores an empty hint as null rather than an empty string', () => {
    const result = promptSchema.safeParse({ ...valid, hint: '   ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.hint).toBeNull()
  })

  it('refuses a person the picker does not know', () => {
    expect(promptSchema.safeParse({ ...valid, person: 'manager' }).success).toBe(false)
  })
})

describe('clothingWords', () => {
  it('finds nothing in a scene that leaves the person dressed by the reference', () => {
    expect(clothingWords(valid.scene)).toEqual([])
  })

  it('catches the back-to-school case that put a bag on the assistant', () => {
    expect(clothingWords('The person is wearing a backpack by the stationery shelf.')).toEqual([
      'backpack',
      'wearing',
    ])
  })

  it('does not match inside a longer word', () => {
    expect(clothingWords('Standing beside the software display.')).toEqual([])
  })
})
