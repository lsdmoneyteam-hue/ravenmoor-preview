// Building definitions for the Ravenmoor 3D demos. All three are fictional developments.
// Plans are axis-aligned rooms in metres (x east, z south). A floor is a list of rooms; rooms that share a
// `unit` belong to one home. Room types: living, kitchen, open (living + kitchen), dining, bed, bath, hall,
// study, utility, balcony, terrace, corridor (shared), lobby (shared), core (lifts and stairs, solid).

const r = (id, type, x, z, w, d, extra = {}) => ({ id, type, x, z, w, d, ...extra });

// One flat laid out in a rectangle. `face` is the side with the windows ('n' or 's'); the other side
// opens onto the corridor. Front strip: open-plan living plus bedrooms. Back strip: hall, bath, storage.
function flat(unit, x0, z0, w, d, face, beds, opts = {}) {
  const rooms = [];
  const back = Math.min(3, d * 0.38);
  const front = d - back;
  const fz = face === 's' ? z0 + back : z0;            // front strip z
  const bz = face === 's' ? z0 : z0 + front;           // back strip z
  const liv = beds === 0 ? w : Math.max(beds === 1 ? 4.5 : 4, Math.round(w * (beds >= 3 ? 0.36 : beds === 2 ? 0.4 : 0.46) * 4) / 4);
  const livX = opts.livingLeft ? x0 : x0 + w - liv;
  rooms.push(r(unit + '-liv', 'open', livX, fz, liv, front, { unit, name: 'Living, kitchen and dining' }));
  const bw = (w - liv) / Math.max(beds, 1);
  for (let i = 0; i < beds; i++) {
    const bx = opts.livingLeft ? x0 + liv + i * bw : x0 + i * bw;
    rooms.push(r(unit + '-b' + (i + 1), 'bed', bx, fz, bw, front, { unit, name: i === 0 ? 'Main bedroom' : 'Bedroom ' + (i + 1) }));
  }
  // back strip: hall sits behind the living room (so it opens into it), bath and store share the rest
  const hallW = Math.min(2.2, liv);
  const hallX = opts.livingLeft ? x0 + liv - hallW : livX;
  rooms.push(r(unit + '-hall', 'hall', hallX, bz, hallW, back, { unit, name: 'Hall' }));
  const restL = hallX - x0, restR = x0 + w - (hallX + hallW);
  const fill = (rx, rw, tag) => {
    if (rw < 1.2) return;
    if (rw > 5.2 && beds >= 2) {
      rooms.push(r(unit + '-ba' + tag, 'bath', rx, bz, 2.6, back, { unit, name: 'Bathroom' }));
      rooms.push(r(unit + '-st' + tag, 'utility', rx + 2.6, bz, rw - 2.6, back, { unit, name: 'Utility and storage' }));
    } else rooms.push(r(unit + '-ba' + tag, rw > 3.6 ? 'bath' : 'utility', rx, bz, rw, back, { unit, name: rw > 3.6 ? 'Bathroom' : 'Storage' }));
  };
  if (restL > 0) fill(x0, restL, 'L');
  if (restR > 0) fill(hallX + hallW, restR, 'R');
  if (!rooms.some(q => q.type === 'bath')) { const s = rooms.find(q => q.type === 'utility'); if (s) { s.type = 'bath'; s.name = 'Bathroom'; } }
  if (opts.balcony) {
    const bd = 1.6, by = face === 's' ? z0 + d : z0 - bd;
    rooms.push(r(unit + '-bal', 'balcony', livX + 0.4, by, liv - 0.8, bd, { unit, name: 'Balcony' }));
  }
  return rooms;
}

const sqm = (rooms, unit) => rooms.filter(q => q.unit === unit && q.type !== 'balcony' && q.type !== 'terrace').reduce((a, q) => a + q.w * q.d, 0);
const money = n => '£' + n.toLocaleString('en-GB');

// ---------- Halden Tower: 26 storeys of glass, Central Milton Keynes (fictional) ----------
export function tower() {
  const W = 30, D = 18, H = 3.15;
  const typical = (f) => {
    const rooms = [
      r('corr', 'corridor', -15, -1, 30, 2, { name: 'Corridor' }),
      r('core', 'core', -2.5, -9, 5, 8, { name: 'Lifts and stairs' }),
    ];
    const u = n => `${f}.${String(n).padStart(2, '0')}`;
    rooms.push(...flat(u(1), -15, -9, 12.5, 8, 'n', 2, { livingLeft: true }));
    rooms.push(...flat(u(2), 2.5, -9, 12.5, 8, 'n', 2));
    rooms.push(...flat(u(3), -15, 1, 10, 8, 's', 2, { livingLeft: true }));
    rooms.push(...flat(u(4), -5, 1, 10, 8, 's', 1));
    rooms.push(...flat(u(5), 5, 1, 10, 8, 's', 2));
    return rooms;
  };
  const penthouse = (f) => {
    const rooms = [
      r('corr', 'corridor', -15, -1, 30, 2, { name: 'Corridor' }),
      r('core', 'core', -2.5, -9, 5, 8, { name: 'Lifts and stairs' }),
    ];
    const u = n => `${f}.${String(n).padStart(2, '0')}`;
    rooms.push(...flat(u(1), -15, -9, 12.5, 8, 'n', 2, { livingLeft: true }));
    rooms.push(...flat(u(2), 2.5, -9, 12.5, 8, 'n', 2));
    rooms.push(...flat(u(3), -15, 1, 15, 8, 's', 3, { livingLeft: true }));
    rooms.push(...flat(u(4), 0, 1, 15, 8, 's', 3));
    return rooms;
  };
  const floors = [];
  floors.push({ label: 'Ground', short: 'G', rooms: [
    r('lobbyW', 'lobby', -15, -9, 12.5, 18, { name: 'Entrance lobby and concierge' }),
    r('lobbyE', 'lobby', 2.5, -9, 12.5, 18, { name: 'Residents\u2019 lounge' }),
    r('lobbyS', 'lobby', -2.5, -1, 5, 10, { name: 'Entrance lobby and concierge' }),
    r('core', 'core', -2.5, -9, 5, 8, { name: 'Lifts and stairs' }),
  ], shared: true });
  for (let f = 1; f <= 23; f++) floors.push({ label: 'Floor ' + f, short: String(f), rooms: typical(f) });
  for (let f = 24; f <= 25; f++) floors.push({ label: 'Floor ' + f, tag: 'Penthouses', short: String(f), rooms: penthouse(f) });

  // homes: price rises with height and size; a few sold or reserved
  const units = {};
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  floors.forEach((fl, fi) => {
    if (fl.shared) return;
    const ids = [...new Set(fl.rooms.filter(q => q.unit).map(q => q.unit))];
    ids.forEach(id => {
      const rs = fl.rooms.filter(q => q.unit === id);
      const beds = rs.filter(q => q.type === 'bed').length;
      const area = sqm(fl.rooms, id);
      const north = rs[0].z < 0;
      const pent = fi >= 24;
      const base = beds === 1 ? 228000 : beds === 2 ? 312000 : 418000;
      const price = Math.round((base * (pent ? 1.9 : 1) + fi * 2400 + (north ? -6000 : 4000)) / 500) * 500;
      const roll = rnd();
      units[id] = {
        id, floor: fi, beds, baths: beds >= 3 ? 2 : 1, area: Math.round(area),
        name: (pent ? 'Penthouse ' : 'Apartment ') + id,
        price: money(price),
        status: fi > 20 && roll < 0.35 ? 'Reserved' : roll < (fi < 8 ? 0.55 : 0.28) ? 'Sold' : roll < 0.4 ? 'Reserved' : 'Available',
        aspect: north ? 'North-facing, city views from a curved balcony' : 'South-facing, curved balcony over the park',
        features: pent
          ? ['Floor-to-ceiling glass on three sides', 'Wraparound sculpted terrace', 'Two parking spaces', 'Concierge and residents’ gym']
          : ['Floor-to-ceiling glazing', beds >= 2 ? 'En-suite to main bedroom' : 'Walk-in wardrobe', 'Sculpted balcony, a different shape on every floor', 'Concierge and residents’ gym'],
      };
    });
  });
  return {
    key: 'tower', name: 'Halden Tower', place: 'Central Milton Keynes',
    blurb: '26 storeys wrapped in rippling white balconies, no two floors the same. 115 apartments and eight penthouses.',
    style: 'glass', floorH: H, size: [W, D], floors, units,
    site: { kind: 'city', water: false, park: 's' },
    roof: 'crown', startHour: 18.5,
    spec: {
      materials: 'A concrete frame with floor-to-ceiling glass and bronze fins. Every floor has a white balcony that curves in and out, so the tower ripples like water and no two homes have the same outline.',
      finishes: 'Engineered oak floors, stone worktops, fitted wardrobes and porcelain-tiled bathrooms. Try the Style button to see other finishes.',
      nearby: 'Milton Keynes Central station is 6 minutes on foot (Euston in 32 minutes). Campbell Park is across the road and centre:mk is 4 minutes away.',
      energy: 'Predicted EPC B. Heating and hot water from a shared air-source heat network; triple glazing throughout.',
      parking: 'Basement parking for the two- and three-bedroom homes, with EV charging. Secure bike store for everyone.',
    },
    asks: ['Show me it at sunset', 'Cheapest 2 bed', 'What is it made of?', 'What is nearby?'],
  };
}

// ---------- Wharf Row: five storeys of brick on the canal (fictional) ----------
export function block() {
  const H = 3.0;
  const typical = (f) => {
    const u = n => `${f === 0 ? 'G' : f}.${String(n).padStart(2, '0')}`;
    const rooms = [
      r('corr', 'corridor', -18, -1, 36, 2, { name: 'Corridor' }),
      r('core', 'core', -2, -9, 4, 8, { name: 'Lifts and stairs' }),
    ];
    rooms.push(...flat(u(1), -18, -9, 8, 8, 'n', 1, { livingLeft: true }));
    rooms.push(...flat(u(2), -10, -9, 8, 8, 'n', 1));
    rooms.push(...flat(u(3), 2, -9, 8, 8, 'n', 1, { livingLeft: true }));
    rooms.push(...flat(u(4), 10, -9, 8, 8, 'n', 1));
    if (f === 0) rooms.push(r('lobby', 'lobby', -18, 1, 12, 8, { name: 'Entrance and bike store' }));
    else rooms.push(...flat(u(5), -18, 1, 12, 8, 's', 2, { livingLeft: true, balcony: true }));
    rooms.push(...flat(u(6), -6, 1, 12, 8, 's', 2, { balcony: f > 0 }));
    rooms.push(...flat(u(7), 6, 1, 12, 8, 's', 2, { livingLeft: true, balcony: f > 0 }));
    return rooms;
  };
  const floors = [];
  for (let f = 0; f <= 4; f++) floors.push({ label: f === 0 ? 'Ground' : 'Floor ' + f, short: f === 0 ? 'G' : String(f), rooms: typical(f) });
  const units = {};
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  floors.forEach((fl, fi) => {
    const ids = [...new Set(fl.rooms.filter(q => q.unit).map(q => q.unit))];
    ids.forEach(id => {
      const rs = fl.rooms.filter(q => q.unit === id);
      const beds = rs.filter(q => q.type === 'bed').length;
      const canal = rs[0].z > 0;
      const price = Math.round(((beds === 1 ? 199000 : 268000) + fi * 3500 + (canal ? 14000 : 0)) / 500) * 500;
      const roll = rnd();
      units[id] = {
        id, floor: fi, beds, baths: 1, area: Math.round(sqm(fl.rooms, id)),
        name: 'Apartment ' + id, price: money(price),
        status: roll < 0.3 ? 'Sold' : roll < 0.45 ? 'Reserved' : 'Available',
        aspect: canal ? 'Canal-facing, south' : 'Street-facing, north',
        features: [canal && fi > 0 ? 'Balcony over the Grand Union Canal' : 'Juliet balcony', 'Shared roof garden', 'Secure bike store', 'Help to Buy eligible (demo)'],
      };
    });
  });
  return {
    key: 'block', name: 'Wharf Row', place: 'Grand Union Canal, Milton Keynes',
    blurb: 'A row of gabled brick wharf houses on the canal. 34 apartments and a roof garden.',
    style: 'brick', floorH: H, size: [36, 18], floors, units,
    site: { kind: 'canal', water: true },
    roof: 'gables', startHour: 16.5,
    spec: {
      materials: 'Three tones of handmade brick, laid as a row of gabled wharf houses. Black steel windows and balconies, and standing-seam zinc roofs.',
      finishes: 'Oak floors, shaker kitchens with stone worktops, and tiled bathrooms. Try the Style button to see other finishes.',
      nearby: 'The towpath runs to Campbell Park in 10 minutes. Milton Keynes Central is 9 minutes by bike, and there is a cafe and a shop on the next wharf.',
      energy: 'Predicted EPC B. Air-source heat pumps and solar panels on the south roof slopes.',
      parking: 'One space for each two-bedroom home in the courtyard, plus a secure bike store.',
    },
    asks: ['Show me it at night', 'Cheapest 1 bed', 'Take me to the roof garden', 'What is it made of?'],
  };
}

// ---------- Ashcombe House: a four-bedroom detached house (fictional) ----------
export function house() {
  const H = 2.7;
  const ground = [
    r('hall', 'hall', -1.2, -4.5, 2.6, 4.2, { unit: 'house', name: 'Entrance hall' }),
    r('living', 'living', -6, -4.5, 4.8, 4.2, { unit: 'house', name: 'Living room' }),
    r('study', 'study', 1.4, -4.5, 4.6, 3.0, { unit: 'house', name: 'Study' }),
    r('wc', 'bath', 1.4, -1.5, 1.8, 1.2, { unit: 'house', name: 'Cloakroom' }),
    r('util', 'utility', 3.2, -1.5, 2.8, 1.2, { unit: 'house', name: 'Utility' }),
    r('kitchen', 'kitchen', 1.4, -0.3, 4.6, 4.8, { unit: 'house', name: 'Kitchen' }),
    r('dining', 'dining', -1.2, -0.3, 2.6, 4.8, { unit: 'house', name: 'Dining' }),
    r('family', 'living', -6, 0.3, 4.8, 4.2, { unit: 'house', name: 'Family room' }),
    r('snug', 'hall', -6, -0.3, 4.8, 0.6, { unit: 'house', name: 'Passage' }),
  ];
  const first = [
    r('land', 'hall', -1.2, -4.5, 2.6, 4.2, { unit: 'house', name: 'Landing' }),
    r('b1', 'bed', -6, -4.5, 4.8, 4.2, { unit: 'house', name: 'Main bedroom' }),
    r('ens', 'bath', 1.4, -4.5, 2.4, 2.2, { unit: 'house', name: 'En-suite' }),
    r('ward', 'utility', 3.8, -4.5, 2.2, 2.2, { unit: 'house', name: 'Dressing room' }),
    r('b4', 'study', 1.4, -2.3, 4.6, 2.0, { unit: 'house', name: 'Bedroom 4 / office' }),
    r('bath', 'bath', -1.2, -0.3, 2.6, 2.4, { unit: 'house', name: 'Family bathroom' }),
    r('b2', 'bed', 1.4, -0.3, 4.6, 4.8, { unit: 'house', name: 'Bedroom 2' }),
    r('b3', 'bed', -6, 0.3, 4.8, 4.2, { unit: 'house', name: 'Bedroom 3' }),
    r('linen', 'utility', -1.2, 2.1, 2.6, 2.4, { unit: 'house', name: 'Linen cupboard' }),
    r('lp', 'hall', -6, -0.3, 4.8, 0.6, { unit: 'house', name: 'Landing' }),
  ];
  const floors = [
    { label: 'Ground floor', short: 'G', rooms: ground },
    { label: 'First floor', short: '1', rooms: first },
  ];
  const units = {
    house: {
      id: 'house', floor: 0, beds: 4, baths: 3, area: Math.round(sqm(ground, 'house') + sqm(first, 'house')),
      name: 'Ashcombe House', price: money(625000), status: 'Available',
      aspect: 'South-facing garden, 28 m long',
      features: ['Kitchen and dining across the back', 'Study and cloakroom downstairs', 'Main bedroom with dressing room and en-suite', 'Driveway for two cars, EV charger'],
    },
  };
  // a short note for each room, shown when you tap it
  const notes = {
    hall: 'Oak floor, understairs storage and the stairs up to the landing.',
    living: 'Bay-facing front room with a wood burner.',
    study: 'Quiet room at the front with built-in shelving.',
    kitchen: 'Quartz worktops, an island with seating and bifold doors to the garden.',
    dining: 'Opens to the kitchen and the garden; seats eight.',
    family: 'Garden-facing room off the kitchen.',
    b1: 'Main bedroom over the front, with a dressing room and en-suite.',
    b2: 'Double bedroom over the garden.',
    b3: 'Double bedroom over the garden.',
    b4: 'Single bedroom or home office.',
    bath: 'Bath with shower over, heated towel rail.',
    ens: 'Walk-in shower, twin basins.',
  };
  return {
    key: 'house', name: 'Ashcombe House', place: 'Newport Pagnell, Milton Keynes',
    blurb: 'A modern barn-style family home with a glazed gable over the garden. Walk through every room.',
    style: 'house', floorH: H, size: [12, 9], floors, units, notes,
    site: { kind: 'suburb' }, roof: 'barn', startHour: 15.5, single: true,
    doorAt: { 'hall|study': 0.2 }, wallKind: { 'hall|wc': 'solid' },
    spec: {
      materials: 'White lime render with black charred-timber cladding on the gables, a natural slate roof and an oak-framed porch. The back gable is glazed to the ridge.',
      finishes: 'Oak floors, a quartz island kitchen, a wood burner in the living room and stone-tiled bathrooms. Try the Style button to see other finishes.',
      nearby: 'Ousedale School is a 12-minute walk and Newport Pagnell high street is 8. The M1 is 5 minutes by car and Milton Keynes Central 15.',
      energy: 'EPC B. Air-source heat pump, underfloor heating downstairs and solar panels on the south roof.',
      parking: 'A block-paved drive for two cars with an EV charger.',
      garden: 'The garden faces south and is 28 metres long, with a stone terrace, a pergola and a lawn.',
    },
    asks: ['Take me to the kitchen', 'Show me it at sunset', 'What is it made of?', 'How big is the garden?'],
  };
}
