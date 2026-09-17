/**
 * The art direction a cover can be generated from. E8-04.
 *
 * **Shipped defaults, not the source of truth.** These are inserted into
 * `cover_prompts` by `pnpm db:seed` when a slug is missing, and **never updated
 * over a row that already exists** — see `seedCoverPrompts`. The whole reason
 * the prompts moved into the database is that they are tuned by looking at what
 * the model sent back, and a seed that overwrites live edits would undo that
 * work on the next deploy.
 *
 * **Every one of these is a photograph, not a theme.** That is the correction
 * they exist to encode. "A weekend sale, energetic and simple" is an adjective,
 * and a model handed an adjective returns the average of everything ever
 * labelled with it — which is what made the first covers look like stock art.
 * A scene names a *place*, a *person doing something*, and a *light*. It reads
 * like a picture somebody took in the shop, because that is what an owner wants
 * their cover to look like.
 *
 * **None of them says what the person wears.** The uniform comes from the
 * character reference image, and a scene that dresses them fights it — which is
 * exactly how a back-to-school prompt once put a school bag on the assistant.
 * `coverPrompt` owns the person; these own the place.
 */
export interface CoverPromptSeed {
  slug: string
  label: string
  hint: string
  scene: string
  group: 'everyday' | 'season' | 'occasion'
  sortOrder: number
}

export const SEED_COVER_PROMPTS: readonly CoverPromptSeed[] = [
  // ── Everyday: the shop on an ordinary trading day ───────────────────────
  {
    slug: 'announcement',
    label: 'Announcing the sale',
    hint: 'Holding a microphone beside a stacked display',
    scene:
      'Inside the shop, beside a tall pallet display of stacked promotional stock. The person holds a handheld microphone up and is mid-announcement, the other hand open towards the stack, telling customers about the offers. Shoppers and trolleys blurred in the aisle behind. Overhead shop lighting, the aisle receding out of focus.',
    group: 'everyday',
    sortOrder: 10,
  },
  {
    slug: 'produce-aisle',
    label: 'In the vegetable section',
    hint: 'Setting out crates of fresh produce',
    scene:
      'In the fresh produce section, at the vegetable beds. The person is setting a crate of tomatoes down onto the display, hands on the crate, looking up at the camera. Peppers, leaves, cucumbers and herbs banked either side, misted and glistening. Bright cool overhead light, the wet green of the produce filling the lower frame.',
    group: 'everyday',
    sortOrder: 20,
  },
  {
    slug: 'frozen-aisle',
    label: 'At the freezers',
    hint: 'Cold light from an open freezer door',
    scene:
      'In the frozen food aisle. The person holds one glass freezer door open and gestures to the packs inside, the cold blue light spilling out across them and a little mist at the opening. Frost patterning the glass of the doors along the aisle. The rest of the aisle darker and receding behind.',
    group: 'everyday',
    sortOrder: 30,
  },
  {
    slug: 'bakery-counter',
    label: 'At the bakery counter',
    hint: 'Fresh bread coming out on a tray',
    scene:
      'At the in-store bakery counter. The person slides a tray of fresh bread and pastries onto the rack, steam still rising from the loaves. Baskets of bread banked behind them, warm amber light from the counter lamps, flour dust catching in the air.',
    group: 'everyday',
    sortOrder: 40,
  },
  {
    slug: 'butcher-counter',
    label: 'At the meat counter',
    hint: 'Behind the chilled counter with a tray',
    scene:
      'Behind the chilled meat and poultry counter. The person presents a tray of fresh cuts across the glass towards the camera, the lit display case full below them. Clean white tiling and stainless steel behind, bright even counter lighting.',
    group: 'everyday',
    sortOrder: 50,
  },
  {
    slug: 'shelf-stacking',
    label: 'Facing up the shelves',
    hint: 'Arranging stock in the aisle',
    scene:
      'Halfway down a grocery aisle, shelves full on both sides. The person is arranging packets on a shelf at chest height, turned towards the camera with a half-smile as if caught mid-task. Shelf-edge price rails running away down the aisle, overhead strip lighting, real depth down the aisle behind them.',
    group: 'everyday',
    sortOrder: 60,
  },
  {
    slug: 'entrance-trolleys',
    label: 'At the entrance',
    hint: 'By the doors and the trolley bay',
    scene:
      'Just inside the shop entrance, beside the nested row of trolleys. The person stands with one hand on a trolley handle, welcoming, the automatic doors and daylight behind them blowing out slightly. The first promotional display visible just inside.',
    group: 'everyday',
    sortOrder: 70,
  },
  {
    slug: 'full-trolley',
    label: 'With a full trolley',
    hint: 'Pushing a loaded trolley down the aisle',
    scene:
      'In a wide main aisle. The person pushes a trolley piled high with groceries towards the camera, both hands on the handle, walking. Slight motion in the frame. Stacked promotional ends either side of the aisle, overhead shop lighting.',
    group: 'everyday',
    sortOrder: 80,
  },
  {
    slug: 'checkout',
    label: 'At the till',
    hint: 'Scanning through a full basket',
    scene:
      'At a checkout lane. The person stands at the till with a full basket on the belt, one item in hand mid-scan, looking up towards the camera. The lane numbers and the bagging area beside them, the shop floor soft behind.',
    group: 'everyday',
    sortOrder: 90,
  },

  // ── Season: the shop dressed for a time of year ─────────────────────────
  {
    slug: 'ramadan-table',
    label: 'Ramadan display',
    hint: 'Dates and lanterns, set out at dusk',
    scene:
      'Beside a Ramadan display table in the shop. The person sets a bowl of dates onto the table, which is laid with dates, nuts, dried fruit and sweets. Lanterns hung above at different heights, warm low light, deep indigo and gold in the decoration. Calm and generous rather than loud.',
    group: 'season',
    sortOrder: 110,
  },
  {
    slug: 'eid-sweets',
    label: 'Eid display',
    hint: 'Trays of sweets and wrapped gifts',
    scene:
      'At an Eid display in the shop. The person presents a tray of sweets towards the camera, with wrapped gift boxes, geometric ornament and hanging decoration stacked on the display behind them. Gold against a rich colour, festive and warm.',
    group: 'season',
    sortOrder: 120,
  },
  {
    slug: 'summer-ice',
    label: 'Summer drinks',
    hint: 'Bottles pulled from a tub of ice',
    scene:
      'At a summer drinks display. The person lifts a cold bottle out of a large tub packed with ice, water running off it, holding it up towards the camera. Watermelon and citrus stacked on the chilled display beside. Bright hard light, pool-blue and white.',
    group: 'season',
    sortOrder: 130,
  },
  {
    slug: 'back-to-school',
    label: 'Back to school',
    hint: 'Stationery stacked on a display table',
    scene:
      'At a back-to-school display table. The person stacks notebooks onto the table, which is laid out with pots of pencils, lunch boxes and school supplies in bright primary colours. Clean bright light. The goods are on the table and being arranged for sale, never held up as a costume.',
    group: 'season',
    sortOrder: 140,
  },
  {
    slug: 'winter-warmers',
    label: 'Winter',
    hint: 'Tea, spices and blankets set out',
    scene:
      'At a winter display in the shop. The person arranges packets of tea and jars of warm spice on the display, folded blankets stacked beside. Low amber light against the cooler light of the shop floor, cosy and still.',
    group: 'season',
    sortOrder: 150,
  },

  // ── Occasion: a one-off the shop is having ──────────────────────────────
  {
    slug: 'clearance-pallets',
    label: 'Clearance',
    hint: 'Pallets of stock, priced to go',
    scene:
      'In front of a clearance area — pallets and shelves of stacked stock, deliberately plain and piled high. The person stands to one side gesturing across it with an open hand. Strong hard light, hot reds and yellows in the shelf-edge ticketing, urgent and busy.',
    group: 'occasion',
    sortOrder: 210,
  },
  {
    slug: 'national-day',
    label: 'National day',
    hint: 'Bunting strung above the display',
    scene:
      'At a national day display. The person stands beside it with an open, welcoming gesture, bunting and ribbon strung above the goods and flags on stands at either end. Patriotic colour, proud and warm, bright even light.',
    group: 'occasion',
    sortOrder: 220,
  },
  {
    slug: 'grand-opening',
    label: 'Grand opening',
    hint: 'Ribbon across new shelves',
    scene:
      'At the front of a newly fitted shop. A ribbon is strung across the new shelving with balloons tied at each end, confetti in the air. The person stands beside it, welcoming, the shop bright and completely fresh behind them.',
    group: 'occasion',
    sortOrder: 230,
  },
  {
    slug: 'weekend-stack',
    label: 'Weekend offers',
    hint: 'A big stacked display of the week’s deals',
    scene:
      'Beside a large end-of-aisle display stacked with the week’s offers — everyday food, packaged staples, bread and fruit piled generously. The person stands beside it presenting it with an open hand. Bright late-morning light, cheerful and abundant.',
    group: 'occasion',
    sortOrder: 240,
  },
] as const
