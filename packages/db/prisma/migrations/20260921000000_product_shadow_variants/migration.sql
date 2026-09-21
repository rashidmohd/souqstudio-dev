-- Which shadow presets have been rendered for an image. E14 §2.4.
--
-- The pixels are a derived key beside the source — `shadowKey(r2Key, preset)` —
-- so this records only *which* renditions exist. Without it a page would have
-- to HEAD the bucket once per card to know whether it may point at one.
ALTER TABLE "image_assets"
  ADD COLUMN "shadowPresets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
