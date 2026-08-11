import { describe, it, expect } from 'vitest'
import type { Role } from '@souqstudio/types'
import {
  ROLE_RANK,
  assignableRoles,
  atLeast,
  canAssignRole,
  isRole,
  resolveRole,
  toRole,
} from '@/lib/authz'

/**
 * The pure half of the authorization module.
 *
 * The gates below it are thin wrappers around a Prisma query and a comparison;
 * what is worth pinning down is the policy — who outranks whom, who may hand
 * out what, and the rule that decides whether an org-level role reaches a shop
 * at all. Those are the answers a future change could plausibly get wrong.
 */

const ROLES: Role[] = ['owner', 'manager', 'editor', 'viewer']

describe('rank', () => {
  it('orders owner above manager above editor above viewer', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.manager)
    expect(ROLE_RANK.manager).toBeGreaterThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer)
  })

  it('is reflexive — a role always meets its own minimum', () => {
    for (const role of ROLES) expect(atLeast(role, role)).toBe(true)
  })

  it('lets an owner satisfy every minimum', () => {
    for (const role of ROLES) expect(atLeast('owner', role)).toBe(true)
  })

  it('lets a viewer satisfy nothing above viewer', () => {
    expect(atLeast('viewer', 'editor')).toBe(false)
    expect(atLeast('viewer', 'manager')).toBe(false)
    expect(atLeast('viewer', 'owner')).toBe(false)
  })
})

describe('toRole', () => {
  it('accepts the four roles', () => {
    for (const role of ROLES) expect(toRole(role)).toBe(role)
  })

  it('floors anything unrecognised at viewer', () => {
    // `role` is a plain String column. The failure direction of a corrupt value
    // has to be less access, never more — a typo must not mint an owner.
    expect(toRole('admin')).toBe('viewer')
    expect(toRole('OWNER')).toBe('viewer')
    expect(toRole(null)).toBe('viewer')
    expect(toRole(undefined)).toBe('viewer')
    expect(toRole('')).toBe('viewer')
  })

  it('narrows with isRole', () => {
    expect(isRole('manager')).toBe(true)
    expect(isRole('superuser')).toBe(false)
  })
})

describe('resolveRole', () => {
  it('gives an owner every shop without a grant row', () => {
    // E2-04: "Owner sees all shops automatically." Signup writes no
    // user_shop_access row, so this is also what stops existing accounts
    // needing a backfill.
    expect(resolveRole({ orgRole: 'owner', grant: null })).toBe('owner')
  })

  it('gives a non-owner with no grant row nothing', () => {
    // Deliberate: users.role is what someone may be made, user_shop_access is
    // where they may act. An org-level manager assigned to no shop reaches no
    // shop.
    expect(resolveRole({ orgRole: 'manager', grant: null })).toBeNull()
    expect(resolveRole({ orgRole: 'editor', grant: null })).toBeNull()
    expect(resolveRole({ orgRole: 'viewer', grant: null })).toBeNull()
  })

  it('falls back to the org role when the grant carries none', () => {
    expect(resolveRole({ orgRole: 'editor', grant: { role: null } })).toBe('editor')
  })

  it('lets a grant override the org role in either direction', () => {
    // E2-04: "the same or different role per shop." Both directions matter —
    // a manager who is only a viewer in one branch is the point of the column.
    expect(resolveRole({ orgRole: 'editor', grant: { role: 'manager' } })).toBe('manager')
    expect(resolveRole({ orgRole: 'manager', grant: { role: 'viewer' } })).toBe('viewer')
  })

  it('ignores a grant row for an owner', () => {
    expect(resolveRole({ orgRole: 'owner', grant: { role: 'viewer' } })).toBe('owner')
  })

  it('floors an unrecognised grant role at viewer', () => {
    expect(resolveRole({ orgRole: 'manager', grant: { role: 'root' } })).toBe('viewer')
  })
})

describe('assignableRoles', () => {
  it('lets an owner grant anything below owner', () => {
    expect(assignableRoles('owner')).toEqual(['manager', 'editor', 'viewer'])
  })

  it('lets a manager grant editor and viewer — E2-03', () => {
    expect(assignableRoles('manager')).toEqual(['editor', 'viewer'])
  })

  it('lets editors and viewers grant nothing', () => {
    expect(assignableRoles('editor')).toEqual(['viewer'])
    expect(assignableRoles('viewer')).toEqual([])
  })

  it('never lets anyone grant owner', () => {
    // There is exactly one path to owner and it is signup.
    for (const role of ROLES) expect(assignableRoles(role)).not.toContain('owner')
    for (const role of ROLES) expect(canAssignRole(role, 'owner')).toBe(false)
  })

  it('never lets anyone grant their own rank', () => {
    // A manager minting a second manager would widen their own blast radius
    // without an owner ever deciding to.
    for (const role of ROLES) expect(canAssignRole(role, role)).toBe(false)
  })
})
