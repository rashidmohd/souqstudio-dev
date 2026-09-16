# E8 — working notes

What exists, what does not, and the corrections to `docs/E8-ai-features.md` that building
the one shipped feature produced. The epic stays the record of what was asked for; this
file is the record of what happened.

Written 15 September 2026, later than it should have been: E8-07 shipped on 10 September
and every other epic from E2 onward had a working note within a day of landing. What was
already recorded lived in three places — the epic doc's own §E8-07, `docs/STATUS.md` §3 and
the root `CLAUDE.md` Known gaps — which is two places too many for anyone picking this up.

**Read `docs/E7-pending.md` §8 before this file.** Magic block *matches* against the seeded
library rather than drawing a document, and the reason the library is structure-times-skin
is the reason that is possible at all.

---

## 1. Four of nine features are built, and the ratio understates it

| Feature | State |
| --- | --- |
| E8-01 AI character creation | Not built — `ai.character` throws |
| E8-02 Character pose library | Not built — `ai.pose` throws |
| E8-03 Custom character prompt | Not built — `ai.prompt` throws |
| E8-04 AI cover generation | Not built — `ai.cover` throws |
| E8-05 Background removal | **Built** — `bg` worker, logos and catalog cutouts |
| E8-06 AI metadata enrichment | Not built — `enrich` throws, and it blocks E5's Arabic |
| E8-07 Magic block | **Built**, end to end, exercised live |
| E8-08 Brand direction | **Built** 16 September, end to end. Never run against a live model — §2 |
| E8-09 Logo mark | **Built** 16 September, matched-not-drawn. Never run against a live model — §2 |

`apps/worker/src/workers/ai.worker.ts` is three branches and a throw: `ai.magicBlock`,
`ai.brandDirection` and `ai.logoGen` are handled, and the four image job names reach
`throw new Error(\`Not yet implemented: ${job.name}\`)`. Those four are the ones that need a
diffusion model — §3.

**The four are wired at both ends and connected at neither.** `enqueueAiJob` in
`packages/db/src/queue-client.ts` names them `ai.${payload.type}`, it is exported from
`@souqstudio/db`, and **nothing calls it** — no route, no screen. So the failure an owner
would meet is not a job that fails; it is a button that does not exist. Worth knowing before
someone "fixes" the worker and wonders why nothing reaches it.

The routing itself is deliberate and worth not undoing: the worker branches on the *job
name* rather than on a `type` field, which is what let `MagicBlockPayload` drop the
`shopId` that `AiJobPayload` requires and a block does not have — a block is
organization-scoped, because a chain designs a card once and every shop in it uses that
card.

**The ratio understates it because E8-07 was the hard one and the other four are the same
job four times.** Character, pose, prompt and cover all want a diffusion model, one
provider decision, and one image-storage path; they are gated on a choice rather than on
work. E8-07 needed a vision model, a closed vocabulary, a schema the reply is validated
against, and an assembly path that cannot emit an illegal block — and none of that
transfers to generating pictures.

**Credits are real on the one that ships.** `consumeCredits()` in
`packages/db/src/credits.ts` had no caller until magic block; it has one now, and two real
charges against the dev organization. The rule that matters and is easy to get wrong in the
other four: **credits are deducted on completion, never at queue time**, and a declined
match charges nothing.

---

## 2. Neither provider can complete a call in this environment — 15 September

This is the first thing to fix and it is five minutes of work, but nothing says so from
inside the product: the job queues, the worker picks it up, and the call fails.

- **`ANTHROPIC_API_KEY` is the literal string `sk-ant-` in both `apps/worker/.env` and
  `apps/web/.env.local`.** Seven characters. It satisfies
  `z.string().startsWith('sk-ant-')` in `apps/worker/src/lib/env.ts`, so **the worker boots
  cleanly and the validation is no help at all** — the failure arrives later as a 401 from
  the API. `MAGIC_BLOCK_PROVIDER` defaults to `anthropic`, so this is the path the product
  takes today.
- **`DASHSCOPE_API_KEY` is real — and it is in the wrong file.** It sits in
  `apps/web/.env.local`, where `apps/web/lib/env.ts` does not declare it and no web code
  reads it. The only consumer is the worker's `vision-qwen.ts`, and `apps/worker/.env` does
  not have it. So the Qwen path, the one that has actually produced a match, cannot run
  either: setting `MAGIC_BLOCK_PROVIDER=qwen` makes the worker **refuse to boot**, by the
  `superRefine` that exists to catch exactly this.

**Half of this is now fixed and the decided half is not.** The DashScope key was copied
into `apps/worker/.env` on 15 September, so the Qwen path is available again and
`magic:check` can be run against it. **The Anthropic key is deferred by decision** — asked
and answered on 15 September, "we do that later" — so the Claude path stays a placeholder.

**What that leaves, and it is a live defect rather than a gap:** `MAGIC_BLOCK_PROVIDER` is
unset, unset means `anthropic`, and the Anthropic key is a placeholder. So **every magic
block an owner attempts on dev fails.** The dialog is reachable from two places on
`/brand/blocks` and `/brand`, the job queues, the worker picks it up, the call 401s, and
`MagicBlockDialog` reports *"That did not finish. You were not charged — try again"* —
which is true about the charge, honest about the failure, and invites a retry that cannot
ever succeed.

Two ways to close it, and the second is a decision rather than a task:

- `MAGIC_BLOCK_PROVIDER=qwen` in `apps/worker/.env`. One line, the key is there, and
  unsetting it is the rollback. **Not done here, deliberately** — see below.
- A real `ANTHROPIC_API_KEY`, whenever that happens.

**Flipping the provider is exactly the decision the epic says not to inherit from a
default.** `docs/E8-ai-features.md` → "Two operational traps": *"sending shop owners'
uploaded images to a given provider is a decision worth making deliberately for GCC
customers rather than inheriting from a default."* Deferring Claude and letting the product
fall to Qwen by accident would be inheriting it. Deferring Claude and switching to Qwen on
purpose is fine — it just has to be on purpose, which is why the key is in place and the
variable is not.

**The startsWith check is worth keeping and worth not trusting.** It catches a key pasted
from the wrong provider, which is a real mistake. It cannot catch a placeholder of the
right shape, and a placeholder of the right shape is what has been in the tree since the
variable was added. Whether a boot-time ping is worth it is §8.

---

## 2a. What building E8-08 and E8-09 corrected — 16 September

Four things changed against `docs/E8-ai-features.md`, which stays the record of what was
asked for. Each is a place where the honest option was chosen over the specified one.

**The model names a type *mood*, not four typefaces.** The spec said "the model names faces
from an enum". `apps/web/lib/brand-fonts.ts` is a per-slot catalog — Changa is narrow
enough for a price, Lalezar is wrong for body copy — so a model naming four families is a
model redoing that filtering from a photograph, badly, and one wrong answer is a kit
rendering in a fallback nobody chose. It names one of four moods; `MOOD_FONTS` in
`apps/web/lib/brand-direction.ts` resolves the mood into real families at acceptance, and
**throws at import** if it ever names a family the catalog does not offer. This is the
first live run's lesson in a third register: do not ask a model anything the code knows.

**The "same colour twice" check is a distance, not a contrast ratio, and a test caught it.**
It was written as contrast first, on the reasoning that two colours which fail to contrast
are two colours nobody can tell apart. They are not: a dark green and a dark red have
nearly the same relative luminance, so WCAG correctly says you cannot read one on the other
and a person correctly says they are green and red. `brand-direction.test.ts` → "keeps two
hues of the same lightness apart" is that regression. Contrast is still what
`price_unreadable` uses, which is the question it actually answers.

**A generated logo is stored as SVG and never rasterised.** The spec said a generated mark
goes through `processLogo` like an upload. It cannot: the mark is set in the shop's headline
face and **the worker has no font files** — the known gap in the root `CLAUDE.md`, where the
brand faces load from Google's CDN in a browser and are not mirrored into R2. Rasterising in
that process substitutes whatever the container happens to have, which is a logo in the
wrong typeface and no error anywhere. A named family in a vector renders correctly on every
surface that has already loaded it, which is all of them. **When the fonts are mirrored, this
can additionally write a PNG.** Until then `shops.logoUrl` points at an SVG for a generated
mark, which is a shape nothing else in the product produces — see §7.

**E8-09 charges on completion; E8-08 charges on acceptance.** They look inconsistent and are
not. A direction is a suggestion that leaves nothing behind when declined, and it is *meant*
to be re-rolled during setup — charging per roll prices a shop out of the step every other
feature depends on. A logo run writes four objects into the bucket whether or not one is
adopted, so it is priced like `character_gen`, which is the same shape.

**Neither has been run against a live model**, for the reason in §2: the default provider is
Anthropic and that key is a placeholder. Both go through `MAGIC_BLOCK_PROVIDER`, so both are
one variable away from working — and both fail today exactly as magic block does.

---

## 3. The four image jobs are a decision, not a backlog item

They need a diffusion model and **which one has not been chosen**. `OPENAI_API_KEY` is
declared in both env schemas, is `sk-` in both `.env` files, and is read by nothing.

What the choice has to answer, none of which is code:

- **Where uploaded staff photographs go.** E8-01 builds a mascot from a picture of a
  uniform — a photograph of somebody's employees, sent to a third party. The epic doc
  already raises this for the vision path and it is sharper here, because a character is
  generated *from* people rather than from a flyer.
- **Whether the provider retains or trains on submissions**, and whether that answer is
  acceptable for GCC customers. This is the same question §E8-07 flags about DashScope and
  it does not have the same answer for every vendor.
- **Cost per image against 10 credits for four variations.** Magic block is priced at 5
  credits against roughly $0.09–0.15 of Claude, which is a comfortable margin on a text
  reply. Four image variations is a different arithmetic and nobody has done it.
- **Where the images are stored and at what size.** `image_assets` exists and the `bg`
  worker already writes variants, so there is a path — but a generated character is
  reusable across every future book, which is a retention question the cutout pipeline does
  not have.

**Until that is answered, building any of the four is guessing at an interface.** The
credit costs are in `CREDIT_COSTS` and the job names are in the queue; nothing else should
be written.

---

## 4. Carried forward — what the live run found, and why the tests could not

Full write-up in `docs/E8-ai-features.md` → "What the first live run found". The two
defects are fixed; they are repeated here because both are *classes* of thing rather than
incidents, and the next AI feature will meet them again.

**A white product name on a white card.** Asked whether the card inverts its type, the
model looked at a white card with a red price band, saw white type on the band, and
answered yes — a fair reading of the picture and the wrong answer to the question. `onTint`
inverted every bound string at once, so the block would have come back with an invisible
product name. The fix was to stop asking: the ground decides it, as it does across the
seeded library.

**The lesson is the one `STATUS.md` §1.0 keeps making in a different register.**
`magic.test.ts` enumerates all 2,400 possible choices and proves each one assembles into a
drawable block — and it passed the broken combination happily, because *an invisible card
is structurally valid*. A test over a schema cannot see a design defect. The gallery can:
`pnpm --filter @souqstudio/engine gallery`.

**A model reply that corrected itself.** Qwen emitted a malformed `notes` array, abandoned
it, and re-emitted the whole object correctly — nested inside the broken one, which had
never closed. Two recovery strategies were wrong before one was right, and the reason is
worth keeping: preferring the first candidate that *parsed* still returned the wreckage,
because mismatched quotes had left the outer object syntactically valid JSON carrying the
right structure name and a `notes` that was a string. **Only the schema separates them**, so
`interpretFirst()` validates every reading in order rather than the first that parses.
`vision-qwen.test.ts` holds the verbatim payload.

This is the asymmetry the two-provider design is built around and it is handled rather than
hidden: Anthropic constrains generation to the schema and cannot return an illegal
structure; Qwen is asked and takes its chances. Nothing downstream knows which answered.

---

## 5. Owed on magic block, cheapest first

Carried from `STATUS.md` §3, which is where this list has been living.

1. **Finish looking at the renders.** The inset change touched 97 boxes across all four
   arrangement shapes. Only the tall ones have been reviewed, with the friendliest product.
   The wide and banner arrangements, the worst case and the Arabic edition are **193
   unreviewed renders** in `harness/out/gallery.html`. Twice now that check has found
   something nothing else could.
2. **Let magic block choose a ground.** The model picks a structure and inherits whatever
   that structure ships with, so an uploaded card with a starburst price comes back with
   the structure's default. One enum on `magicChoiceSchema`, a line of prompt; the assembly
   already handles it.
3. **Run `magic:check` against Claude** — blocked on §2. Two providers were built to be
   compared and the comparison has never been made. It now carries a still case as well as
   three card ones, which is the stricter half: a footer fed back under "footer" either
   comes back as itself or it does not.
4. **Look at the eight square posts.** `social-post` is a new category and its designs are
   new drawings — rendered both directions and checked against `validateBlock`, but the
   gallery's worst-case pass over them has not been read by a person.
5. **No thumbnail is written for a generated block.** Costs nothing today because
   `BlockPreview` draws live from the arrangements and ignores `thumbnailUrl` entirely. It
   stops being free the first time a list wants to render a hundred blocks without
   composing them.

---

## 6. Deliberate compromises

Each is a place where the honest option was chosen over the specified one.

| Thing | What shipped | Why |
| --- | --- | --- |
| Matching, not drawing | The model names a shipped structure and describes a skin | A model emitting free-form block documents drifts the same way sixty hand-drawn cards would, and faster. It also cannot emit an illegal document this way — the output is an enum and six bounded fields. `E7-pending.md` §8 |
| `seasonal` is not offered | Five categories, not six | A seasonal block is a design *plus* an occasion, and `seasonal.ts` computes each window from the calendar. Picking the occasion from a photograph gets a shop wishing its customers Eid Mubarak in March |
| Panels matched to themselves | No skin is asked for outside offer cards | `library-panels.ts` is hand-drawn and already names every colour by role. Asking a model to re-skin a design a person skinned is asking it to overrule that decision from a photograph of somebody else's shop |
| `isMatch: false` is a real answer | Declined, uncharged, never retried | The nearest header to a photograph of a footer is still a header, it draws fine, and the owner paid for it. The picture will not have changed, so a retry is a second charge for the same answer |
| The vocabulary is `SEED_BLOCKS` | The arm compiled into the worker, not the loaded library | Reaching the R2-loaded library would put a network call inside the vision path. True of everything published today; **not true the first time a design ships to a bucket and not to the repo** — see §7 |

---

## 7. Cross-epic seams left open

- **Nothing matches against a design that only exists in R2.** `BLOCK_LIBRARY_URL` decides
  the library source per environment, and magic block's vocabulary does not go through it.
  The day a block is published to a bucket and not to the repo, it becomes invisible to
  matching with no error anywhere. `docs/block-library-from-r2.md`.
- **`enrich` is E8-06 and it is E5's blocker.** The Open Food Facts export has no language
  variants in any of its 211 columns, so every seeded universal product has a null `nameAr`
  and E5 §2 makes that a publish-time blocker for Arabic editions. It is filed under AI
  features and it is holding up the catalog.
- **A generated logo is an SVG where everything else is a PNG.** `processLogo` normalises
  every upload to PNG at 1024 and `shops.logoUrl` has only ever held one. E8-09 writes
  `image/svg+xml` — §2a says why it must. Every surface that draws a logo today is a browser
  and handles it; **E9's export is the one that will not be**, because Playwright rendering a
  vector whose font is named rather than embedded is the same problem one layer down. The
  fix for both is the same mirroring job.
- **E9 will want the generated cover.** E8-04 produces a cover image and the export renders
  `BookPage`; neither knows about the other yet, and the seam is `R2_PUBLIC_URL` plus an
  object key, exactly as `lib/block-assets.ts` already does for uploaded artwork.
- **`MachineOutput` is built and magic block is its only caller.** Every AI feature added
  from here must mark its output the same way — the rule in the root `CLAUDE.md` is that an
  owner must always be able to tell what a machine wrote.

---

## 8. Open questions for a human

| Question | Blocks | Note |
| --- | --- | --- |
| **Which diffusion provider** | E8-01, 02, 03, 04 | §3. Four features, one decision, and none of it is code |
| **Whether uploaded staff photographs may leave the region** | E8-01 | A mascot is generated from a picture of somebody's employees. Different question from sending a flyer to a vision model, and it deserves a different answer |
| **Claude or Qwen for magic block** | **E8-07 working at all on dev** | Deferred on 15 September. While it is deferred the feature fails every attempt, because the default is Anthropic and that key is a placeholder — §2. `MAGIC_BLOCK_PROVIDER=qwen` is the one-line answer if Qwen is acceptable for owners' uploaded images; the comparison by hit rate still wants a real Anthropic key and one `magic:check` per provider |
| **Whether a placeholder API key should fail at boot** | Nothing | §2. A `startsWith` check passes `sk-ant-` exactly. A boot-time ping costs a request per deploy and turns a 401-at-first-use into a refusal to start — which is the trade `withEndpointCheck` already made for R2, and that one was worth it |
| **A re-seed is required for `social-post`** | The category being reachable | It is a new category and two shipped blocks moved into it; the column is only ever written by `pnpm db:seed` |
| **Matched or diffused for the logo mark** | E8-09 | Specified 16 September with a recommendation: a closed set of hand-drawn SVG structures skinned from the shop's palette, exactly as magic block matches rather than draws. It clears the §3 blocker entirely — no diffusion provider, no photograph of anyone, and a vector that prints. Diffusing it instead re-opens every question in §3 |
| **Whether a re-rolled palette should be free** | E8-08 | Specified as free to generate and 3 credits on acceptance, which is the one place E8-07's charge-on-completion ordering is deliberately not copied. A palette is meant to be re-rolled during setup; charging per roll prices a shop out of the step every other feature depends on |
