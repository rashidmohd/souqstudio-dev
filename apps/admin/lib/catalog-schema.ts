import { z } from 'zod'

/**
 * What an admin may write to a catalog row. E13-02.
 *
 * **Not `server-only`.** The form imports it to validate before submitting, so
 * one schema decides what is valid rather than a form and a route disagreeing
 * about it. Nothing here touches Prisma, which is what keeps it importable from
 * a client component.
 *
 * **`archivedAt` is not in here, and neither is `organizationId`.** Archiving is
 * its own action with its own audit entry, and promoting a private row to
 * universal is a third. Folding either into a general update makes both
 * invisible in a diff of forty fields, and the audit log's whole job is that
 * they are not.
 */

export const PACK_UNITS = ['G', 'KG', 'ML', 'L', 'PIECE'] as const
export const SELL_BY = ['PACK', 'LOOSE'] as const

/** Empty text is stored as null, never as an empty string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

export const productSchema = z
  .object({
    nameEn: z.string().trim().min(1, 'A product needs an English name.').max(200),
    /**
     * Nullable at write time even though an Arabic edition cannot publish
     * without it. E5 §2 is explicit that this is a completeness warning and
     * never a hard block: requiring it here would make an admin unable to
     * correct a typo on any of the thousands of seeded rows that have no
     * Arabic name yet.
     */
    nameAr: optionalText(200),
    brandEn: optionalText(120),
    brandAr: optionalText(120),
    specEn: optionalText(200),
    specAr: optionalText(200),
    originEn: optionalText(120),
    originAr: optionalText(120),
    category: optionalText(80),
    subcategory: optionalText(80),
    /**
     * A barcode is stored as text, not a number. Leading zeros are significant
     * and an EAN-13 does not fit in a float without losing its last digit.
     */
    barcode: optionalText(32),
    sku: optionalText(64),
    supplier: optionalText(120),
    packSize: z
      .union([z.number().positive(), z.null()])
      .describe('In packUnit. Null when the product has no printed size.'),
    packUnit: z.enum(PACK_UNITS).nullable(),
    packCount: z.union([z.number().int().positive(), z.null()]),
    sellBy: z.enum(SELL_BY),
  })
  /**
   * A barcode with letters in it is a barcode somebody pasted a product code
   * into. Checked here rather than left to the database, which has no opinion.
   */
  .refine((value) => value.barcode === null || /^[0-9]{6,20}$/.test(value.barcode), {
    message: 'A barcode is 6 to 20 digits. An item code goes in SKU.',
    path: ['barcode'],
  })
  /**
   * `LOOSE` means the price already is the unit price, so a pack size and a
   * multipack count describe nothing. Accepting them would make
   * `deriveUnitPrice` divide a rate by a quantity that was never there — the
   * defect the `SellBy` column was added to fix.
   */
  .refine((value) => value.sellBy !== 'LOOSE' || value.packCount === null, {
    message: 'A loose product has no pack count. The price is already per unit.',
    path: ['packCount'],
  })
  .refine((value) => value.packSize === null || value.packUnit !== null, {
    message: 'Say what the pack size is measured in.',
    path: ['packUnit'],
  })

export type ProductInput = z.infer<typeof productSchema>

/** Every field, as the form holds them: strings, because inputs are strings. */
export type ProductFormValues = {
  [K in keyof ProductInput]: string
}

export function toFormValues(product: Partial<ProductInput>): ProductFormValues {
  const text = (value: string | null | undefined): string => value ?? ''
  const number = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value)

  return {
    nameEn: text(product.nameEn),
    nameAr: text(product.nameAr),
    brandEn: text(product.brandEn),
    brandAr: text(product.brandAr),
    specEn: text(product.specEn),
    specAr: text(product.specAr),
    originEn: text(product.originEn),
    originAr: text(product.originAr),
    category: text(product.category),
    subcategory: text(product.subcategory),
    barcode: text(product.barcode),
    sku: text(product.sku),
    supplier: text(product.supplier),
    packSize: number(product.packSize),
    packUnit: text(product.packUnit),
    packCount: number(product.packCount),
    sellBy: product.sellBy ?? 'PACK',
  }
}

/**
 * Form strings to the shape the schema validates. An unparseable number becomes
 * `NaN` rather than null, so the schema reports it instead of silently
 * discarding what somebody typed.
 */
export function fromFormValues(values: ProductFormValues): unknown {
  const number = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

  return {
    ...values,
    packSize: number(values.packSize),
    packCount: number(values.packCount),
    packUnit: values.packUnit === '' ? null : values.packUnit,
  }
}
