// The words and pictures for each off-plan development. The plans, homes and prices come from /3d/buildings.js.
// To add a development: add its plans to buildings.js, add an entry here, and copy one of the page folders.
// Pictures in /offplan/img/ are stills from the 3D model. Replace them with finished images (same file names) when they are ready.
export const CONTENT = {
  tower: {
    slug: 'halden-tower', model: 'tower', developer: 'Halden Estates', theme: 'night',
    tagline: 'Twenty-six floors that ripple like water.',
    intro: 'Apartments and penthouses above Campbell Park, each with a balcony no other home shares.',
    place: {
      title: 'Why Milton Keynes?',
      text: 'A city built around green space, with London half an hour away and more new jobs each year than almost anywhere in Britain.',
      facts: [['32 min', 'to London Euston'], ['6 min', 'walk to the station'], ['5,000 acres', 'of parkland in the city'], ['4 min', 'to centre:mk']],
    },
    rooms: [
      ['Living', 'living', 'Glass from floor to ceiling, and a balcony that curves round the corner.'],
      ['Kitchen', 'kitchen', 'Stone worktops, full-height larder and a place for everyone to sit.'],
      ['Bedroom', 'bed', 'Quiet, carpeted and facing the sunrise or the park.'],
      ['The view', 'view', 'The city by day, the lights by night.'],
    ],
    feature: {
      unit: '25.03', kicker: 'Level 25 · one home', title: 'The Penthouse',
      line: 'The whole south side of the top floor. Thirty metres of glass, a terrace as wide as the tower, and nobody above you but the lantern.',
      facts: [['240 m²', 'inside'], ['3', 'bedrooms'], ['3', 'bathrooms'], ['£1,450,000', 'guide price']],
      shots: [['pent-dusk', 'The living room at dusk'], ['pent-living', 'Living', 'Eleven metres of glass facing the park.'], ['pent-kitchen', 'Kitchen', 'Stone island, full-height larder, room for ten.'], ['pent-bed', 'Main bedroom', 'Wakes up to the sunrise, with its own dressing room.'], ['pent-terrace', 'The terrace', 'Wraps the whole south side, 80 metres up.']],
    },
    amenTitle: 'Six ways to spend a day',
    amenities: [
      ['Concierge lobby', 'lobby', 'Someone at the desk, day and night.'],
      ['Residents’ lounge', 'lobby', 'A place to work or meet that isn’t your kitchen table.'],
      ['Water garden', 'plaza', 'A reflecting pool, benches and planting at the foot of the tower.'],
      ['Sky terrace', 'roof', 'A garden on the 26th floor, open to every resident.'],
      ['The lantern', 'night', 'A glass room at the top that glows after dark.'],
      ['Campbell Park', 'place', 'A hundred acres across the road.'],
    ],
    spec: [['Structure', 'Concrete frame, triple glazing, bronze fins'], ['Floors', 'Engineered oak; porcelain in bathrooms'], ['Kitchens', 'Stone worktops, integrated appliances'], ['Heating', 'Shared air-source heat network, EPC B'], ['Parking', 'Basement spaces with EV charging']],
    numbers: [['26', 'storeys'], ['122', 'homes'], ['1–3', 'bedrooms'], ['2028', 'completion']],
    sample: { unit: '16.03', floor: 16 },
  },
  block: {
    slug: 'wharf-row', model: 'block', developer: 'Wharf Row Homes', theme: 'brick',
    tagline: 'A row of wharf houses, built for the canal.',
    intro: 'Thirty-four apartments in three colours of brick, with the Grand Union at the door and a garden on the roof.',
    place: {
      title: 'Why the canal?',
      text: 'The towpath is the quiet way through the city: ten minutes to Campbell Park on foot, nine to the station by bike, and no road to cross.',
      facts: [['10 min', 'walk to Campbell Park'], ['9 min', 'cycle to the station'], ['2 min', 'to the wharf café'], ['South', 'facing over the water']],
    },
    rooms: [
      ['Living', 'living', 'Tall steel windows and a balcony over the water.'],
      ['Kitchen', 'kitchen', 'A shaker kitchen with stone worktops and room for a table.'],
      ['Bedroom', 'bed', 'Double bedrooms with the morning light.'],
      ['The view', 'view', 'Narrowboats, trees and the towpath.'],
    ],
    amenTitle: 'Five ways to spend a day',
    amenities: [
      ['Roof garden', 'roof', 'A pergola, a long table and planting, shared by the whole building.'],
      ['The towpath', 'canal', 'Benches by the water and a level walk into town.'],
      ['Balconies', 'hero', 'Black steel balconies on every canal-side home.'],
      ['The street', 'street', 'A row of gables in red, buff and charcoal brick.'],
      ['Evenings', 'night', 'Warm windows on the water.'],
    ],
    spec: [['Walls', 'Three tones of handmade brick'], ['Windows', 'Black steel-look frames, double glazed'], ['Roofs', 'Standing-seam zinc with solar panels'], ['Heating', 'Air-source heat pumps, EPC B'], ['Parking', 'Courtyard spaces and a secure bike store']],
    numbers: [['5', 'storeys'], ['34', 'homes'], ['1–2', 'bedrooms'], ['2027', 'completion']],
    sample: { unit: '3.06', floor: 3 },
  },
  house: {
    slug: 'ashcombe-house', model: 'house', developer: 'Ashcombe Homes', theme: 'sage',
    tagline: 'A modern barn, with a wall of glass to the garden.',
    intro: 'Four bedrooms in white render, black timber and slate, on a quiet road in Newport Pagnell.',
    place: {
      title: 'Why Newport Pagnell?',
      text: 'A market town on the edge of Milton Keynes, with a proper high street, good schools and the river on the doorstep.',
      facts: [['8 min', 'walk to the high street'], ['12 min', 'walk to Ousedale School'], ['5 min', 'drive to the M1'], ['15 min', 'to Milton Keynes Central']],
    },
    rooms: [
      ['Living room', 'living', 'A wood burner, oak beams and a window to the street.'],
      ['Kitchen', 'kitchen', 'A quartz island under the glazed gable, open to the garden.'],
      ['Dining', 'dining', 'Seats eight, with bifold doors to the terrace.'],
      ['Main bedroom', 'bed', 'With its own dressing room and en-suite.'],
    ],
    amenTitle: 'Outside',
    amenities: [
      ['The garden', 'garden', 'South-facing and 28 metres long.'],
      ['The terrace', 'terrace', 'Stone paving under an oak pergola, straight off the kitchen.'],
      ['The front', 'front', 'A block-paved drive for two cars, an oak porch and an EV charger.'],
      ['After dark', 'night', 'Light through the glazed gable.'],
      ['The road', 'place', 'Detached homes, hedges and street trees.'],
    ],
    spec: [['Walls', 'Lime render and charred-timber cladding'], ['Roof', 'Natural slate with solar panels'], ['Floors', 'Oak downstairs, carpet in bedrooms'], ['Heating', 'Air-source heat pump, underfloor heating, EPC B'], ['Kitchen', 'Quartz island, integrated appliances']],
    numbers: [['4', 'bedrooms'], ['3', 'bathrooms'], ['216', 'square metres'], ['28 m', 'garden']],
    sample: { unit: 'house', floor: 0 },
  },
};
