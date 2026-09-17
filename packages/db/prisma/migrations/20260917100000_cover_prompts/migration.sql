-- Cover art direction, as rows. E8-04.
--
-- **The prompts move into the database because the art direction is the
-- product.** They were a TypeScript map and were wrong twice in one day: first
-- a set of adjectives that produced generic wallpaper, then a set of nouns that
-- the model put *on* the shop assistant — a school bag worn, a juice drunk.
-- Both fixes needed a deploy. A prompt is tuned by looking at what came back,
-- and content that needs a release to change is content nobody tunes.
--
-- `scene` is the paragraph that reaches the image model. It describes a
-- photograph of this shop — a place, a person doing something, a light — rather
-- than an occasion. "A weekend sale, energetic and simple" is an adjective a
-- model averages; "the assistant by a stacked pallet display holding a
-- microphone, mid-announcement" is a picture.
--
-- No `organizationId`. These are ours to write and tune; a shop wanting
-- something else has the free-text option the picker already offers.
--
-- `isActive` rather than deletion: a `covers` row records the slug it was made
-- from, and a prompt that produced bad covers is worth keeping to compare
-- against its replacement.

CREATE TABLE "cover_prompts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hint" TEXT,
    "scene" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'everyday',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cover_prompts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cover_prompts_slug_key" ON "cover_prompts"("slug");
CREATE INDEX "cover_prompts_isActive_sortOrder_idx" ON "cover_prompts"("isActive", "sortOrder");
