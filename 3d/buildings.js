// Building definitions for the Ravenmoor 3D demos. All three are fictional developments.
// Plans are axis-aligned rooms in metres (x east, z south). A floor is a list of rooms; rooms that share a
// `unit` belong to one home. Room types: living, kitchen, open (living + kitchen), dining, bed, bath, hall,
// study, utility, balcony, terrace, corridor (shared), lobby (shared), core (lifts and stairs, solid).

const r = (id, type, x, z, w, d, extra = {}) => ({ id, type, x, z, w, d, ...extra });

// One flat laid out in a rectangle. `face` is the side with the windows ('n' or 's'); the other side opens onto the
// shared corridor. Along the windows: open-plan living, then the bedrooms. Behind them: an entrance hall that opens
// into the living room, and a hall running behind the bedrooms with a door to each. Bathrooms and storage sit
// between that hall and the corridor. Every room has exactly one door, and it is off the hall.
function flat(unit, x0, z0, w, d, face, beds, opts = {}) {
  const rooms = [], back = Math.min(3, d * 0.38), front = d - back, strip = 1.1, svc = back - strip, eW = 1.5;
  const fz = face === 's' ? z0 + back : z0;                                            // window-side rooms
  const zb = (t, depth) => face === 's' ? z0 + t : z0 + d - t - depth;                 // t = distance from the corridor wall
  const liv = beds === 0 ? w : Math.max(beds === 1 ? 4.5 : 4, Math.round(w * (beds >= 3 ? 0.36 : beds === 2 ? 0.4 : 0.46) * 4) / 4);
  const L = opts.livingLeft, livX = L ? x0 : x0 + w - liv, add = (id, type, x, z, ww, dd, name) => rooms.push(r(unit + '-' + id, type, x, z, ww, dd, { unit, name }));
  add('liv', 'open', livX, fz, liv, front, 'Living, kitchen and dining');
  const bw = (w - liv) / Math.max(beds, 1), bedX = i => L ? x0 + liv + i * bw : x0 + w - liv - (i + 1) * bw;       // main bedroom is next to the living room
  for (let i = 0; i < beds; i++) add('b' + (i + 1), 'bed', bedX(i), fz, bw, front, i === 0 ? 'Main bedroom' : 'Bedroom ' + (i + 1));
  const eX = L ? livX + liv - eW : livX;
  add('hall', 'hall', eX, zb(0, back), eW, back, 'Hall');
  add('bath', 'bath', L ? livX : livX + eW, zb(0, back), liv - eW, back, 'Bathroom');
  if (beds > 0) {
    const sX = L ? x0 + liv : x0, sW = w - liv;
    add('hall2', 'hall', sX, zb(svc, strip), sW, strip, 'Hall');
    const ens = beds >= 2 && sW >= 3.8 ? 2.4 : 0;
    if (ens) add('ens', 'bath', L ? sX : sX + sW - ens, zb(0, svc), ens, svc, 'En-suite');
    add('store', 'utility', L ? sX + ens : sX, zb(0, svc), sW - ens, svc, ens ? 'Utility and storage' : 'Storage');
  }
  if (opts.balcony) {
    const bd = 1.6, by = face === 's' ? z0 + d : z0 - bd;
    rooms.push(r(unit + '-bal', 'balcony', livX + 0.4, by, liv - 0.8, bd, { unit, name: 'Balcony' }));
  }
  return rooms;
}

const sqm = (rooms, unit) => rooms.filter(q => q.unit === unit && q.type !== 'balcony' && q.type !== 'terrace' && q.type !== 'void').reduce((a, q) => a + q.w * q.d, 0);
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
  // The Penthouse: the whole 25th floor and the roof above it. A double-height great room, three bedroom suites,
  // a dining room and a cinema bar; upstairs a glass sky lounge, a roof garden, and a pool that hangs out over the edge.
  const UP = '25.03', pq = (id, type, x, z, w, d, name, extra = {}) => r(UP + '-' + id, type, x, z, w, d, { unit: UP, name, ...extra });
  const sky25 = () => [
    r('core', 'core', -2.5, -9, 5, 8, { name: 'Private lift and stairs' }),
    pq('hall', 'hall', -15, -1, 30, 2, 'Gallery'),
    pq('liv', 'open', -15, 1, 12, 8, 'Great room', { tall: true }), pq('dining', 'dining', -3, 1, 12, 8, 'Kitchen and dining', { look: 'kd' }), pq('cinema', 'living', 9, 1, 6, 8, 'Cinema', { look: 'cinema' }),
    pq('b1', 'bed', -15, -9, 7.5, 8, 'Main bedroom'), pq('bath', 'bath', -7.5, -9, 5, 4.5, 'Main bathroom'), pq('dress', 'utility', -7.5, -4.5, 5, 3.5, 'Dressing room'),
    pq('b2', 'bed', 2.5, -9, 6, 8, 'Bedroom 2'), pq('bath2', 'bath', 8.5, -9, 2.5, 4, 'Bathroom 2'), pq('laundry', 'utility', 8.5, -5, 2.5, 4, 'Laundry'), pq('b3', 'bed', 11, -9, 4, 8, 'Bedroom 3'),
  ];
  const sky26 = () => [
    r('core', 'core', -2.5, -9, 5, 8, { name: 'Private lift and stairs' }),
    pq('stairtop', 'hall', -7.8, 1, 4.8, 1.5, 'Stair landing'),
    pq('void', 'void', -15, 1, 7.2, 8, 'Open to the great room below'), pq('void2', 'void', -7.8, 2.5, 4.8, 6.5, 'Open to the great room below'),
    pq('poolwalk', 'terrace', -3, 1, 5.5, 8, 'Pool terrace', { blocks: [[0.5, 2.5, 3.2, 5.4]] }),
    pq('pooldeck', 'terrace', 2.5, -4, 12.5, 13, 'Pool terrace and bar', { pool: [3.2, 14.6, 5.4, 9], blocks: [[2.5, 14.6, 3.2, 5.4], [4.6, 14.9, -4, -2.4]], bar: [4.9, 14.6] }),
    pq('bridge', 'terrace', -2.5, -1, 5, 2, 'Terrace'),
    pq('landing', 'hall', 2.5, -9, 2, 5, 'Lift lobby'), pq('sky', 'living', 4.5, -9, 10.5, 5, 'Sky lounge'), pq('garden', 'terrace', -15, -9, 12.5, 10, 'Roof garden'),
  ];
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
  floors.push({ label: 'Floor 24', tag: 'Penthouses', short: '24', rooms: penthouse(24) });
  floors.push({ label: 'Floor 25', tag: 'The Penthouse', short: '25', rooms: sky25() });
  floors.push({ label: 'Roof', tag: 'The Penthouse, upper level', short: 'R', rooms: sky26(), upper: true });

  // homes: price rises with height and size; a few sold or reserved
  const units = {};
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  floors.forEach((fl, fi) => {
    if (fl.shared || fl.upper) return;
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
        id, floor: fi, beds, baths: rs.filter(q => q.type === 'bath').length, area: Math.round(area),
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
  Object.assign(units['25.03'], { name: 'The Penthouse', price: money(19500000), status: 'Available', area: 560, aspect: 'The whole top floor and the roof, with the park below', features: ['Six-metre great room, glass on two sides', 'Glass-bottomed pool hanging over the edge of the tower', 'Sky lounge, roof garden and fire terrace', 'Private lift, cinema, three bedroom suites'] });
  return {
    key: 'tower', name: 'Halden Tower', place: 'Central Milton Keynes',
    blurb: '26 storeys wrapped in rippling white balconies, no two floors the same. 115 apartments, four penthouses and one home across the top two levels.',
    style: 'glass', story: { floor: 25, room: '25.03-liv', hours: [[0, 7.5], [.136, 12], [.26, 17.5], [.33, 19.5], [.434, 21.5], [.5, 30.75], [.6, 33], [.72, 37], [.81, 40.5], [.895, 43.4], [.965, 44.25], [1, 45.5]] }, props: '/3d/props/halden_props.glb', wallKind: { '25.03-dining|25.03-liv': 'none', '25.03-stairtop|25.03-void': 'none' }, autoDoor: ['25.03-poolwalk|25.03-stairtop'], doorAt: { '25.03-hall|25.03-liv': 0.88, '25.03-dining|25.03-hall': 0.08 }, floorH: H, size: [W, D], floors, units,
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
        id, floor: fi, beds, baths: rs.filter(q => q.type === 'bath').length, area: Math.round(sqm(fl.rooms, id)),
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
    style: 'brick', story: { floor: 4, room: '4.06-liv' }, floorH: H, size: [36, 18], floors, units,
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
    r('study', 'study', 1.4, -4.5, 4.6, 2.8, { unit: 'house', name: 'Study' }),
    r('wc', 'bath', 1.4, -1.7, 1.8, 1.4, { unit: 'house', name: 'Cloakroom' }),
    r('util', 'utility', 3.2, -1.7, 2.8, 1.4, { unit: 'house', name: 'Utility' }),
    r('kitchen', 'kitchen', 1.4, -0.3, 4.6, 4.8, { unit: 'house', name: 'Kitchen' }),
    r('dining', 'dining', -1.2, -0.3, 2.6, 4.8, { unit: 'house', name: 'Dining' }),
    r('family', 'living', -6, -0.3, 4.8, 4.8, { unit: 'house', name: 'Family room' }),
  ];
  const first = [
    r('land', 'hall', -1.2, -4.5, 2.6, 5.7, { unit: 'house', name: 'Landing' }),
    r('b1', 'bed', -6, -4.5, 4.8, 4.2, { unit: 'house', name: 'Main bedroom' }),
    r('ens', 'bath', 1.4, -4.5, 2.4, 2.2, { unit: 'house', name: 'Shower room' }),
    r('ward', 'utility', 3.8, -4.5, 2.2, 2.2, { unit: 'house', name: 'Linen and storage' }),
    r('b4', 'study', 1.4, -2.3, 4.6, 2.0, { unit: 'house', name: 'Bedroom 4 / office' }),
    r('bath', 'bath', -1.2, 1.2, 2.6, 3.3, { unit: 'house', name: 'Family bathroom' }),
    r('b2', 'bed', 1.4, -0.3, 4.6, 4.8, { unit: 'house', name: 'Bedroom 2' }),
    r('b3', 'bed', -6, -0.3, 4.8, 4.8, { unit: 'house', name: 'Bedroom 3' }),
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
    style: 'house', story: { floor: 0, room: 'kitchen' }, floorH: H, size: [12, 9], floors, units, notes,
    site: { kind: 'suburb' }, roof: 'barn', startHour: 15.5, single: true,
    doorAt: { 'hall|study': 0.2 }, wallKind: { 'dining|kitchen': 'none', 'dining|family': 'door' },
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
