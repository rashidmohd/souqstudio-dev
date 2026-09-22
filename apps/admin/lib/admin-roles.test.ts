import { describe, expect, it } from 'vitest'
import { ADMIN_ROLES, ROLE_LABELS, isAdminRole, roleAtLeast } from './admin-roles'

describe('isAdminRole', () => {
  it('accepts the three and nothing else', () => {
    for (const role of ADMIN_ROLES) expect(isAdminRole(role)).toBe(true)
    // A row somebody edited by hand. It must not resolve to an authority.
    expect(isAdminRole('admin')).toBe(false)
    expect(isAdminRole('')).toBe(false)
    expect(isAdminRole('SUPER_ADMIN')).toBe(false)
  })
})

describe('roleAtLeast', () => {
  it('lets a role reach its own level', () => {
    for (const role of ADMIN_ROLES) expect(roleAtLeast(role, role)).toBe(true)
  })

  it('nests upward and never downward', () => {
    expect(roleAtLeast('super_admin', 'catalog_manager')).toBe(true)
    expect(roleAtLeast('super_admin', 'support_agent')).toBe(true)
    expect(roleAtLeast('catalog_manager', 'support_agent')).toBe(true)

    expect(roleAtLeast('support_agent', 'catalog_manager')).toBe(false)
    expect(roleAtLeast('support_agent', 'super_admin')).toBe(false)
    expect(roleAtLeast('catalog_manager', 'super_admin')).toBe(false)
  })

  it('keeps publishing to the library out of reach of everyone but a super admin', () => {
    // The gate on POST /api/v1/admin/library/*. Writing the library prefix
    // reaches every shop on the platform.
    expect(roleAtLeast('catalog_manager', 'super_admin')).toBe(false)
  })
})

describe('ROLE_LABELS', () => {
  it('names every role, in sentence case', () => {
    for (const role of ADMIN_ROLES) {
      const label = ROLE_LABELS[role]
      expect(label).toBeTruthy()
      expect(label).toBe(label[0]?.toUpperCase() + label.slice(1).toLowerCase())
    }
  })
})
