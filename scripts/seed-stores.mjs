// Plain-SQL store seeder (drizzle-kit version is blocked by a dependency
// that needs `competitors` table). We just need stores for the dashboard.

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const STORES = [
  { slug: "dublin",        name: "88baobao Dublin",        addr: "3880 Fallon Rd",                    city: "Dublin",        state: "CA", zip: "94568", phone: "(925) 361-5760", status: "open" },
  { slug: "concord",       name: "88baobao Concord",       addr: "785 Oak Grove Rd Ste E3",           city: "Concord",       state: "CA", zip: "94518", phone: null,             status: "open" },
  { slug: "brentwood",     name: "88baobao Brentwood",     addr: "5421 Lone Tree Way #103",           city: "Brentwood",     state: "CA", zip: "94513", phone: null,             status: "open" },
  { slug: "davis",         name: "88baobao Davis",         addr: "865 Russell Blvd #130",             city: "Davis",         state: "CA", zip: "95616", phone: null,             status: "open" },
  { slug: "manteca",       name: "88baobao Manteca",       addr: "2235 W Atherton Dr #108",           city: "Manteca",       state: "CA", zip: "95337", phone: null,             status: "open" },
  { slug: "stockton",      name: "88baobao Stockton",      addr: "10710 Trinity Pkwy Ste C",          city: "Stockton",      state: "CA", zip: "95219", phone: "(209) 888-4071", status: "open" },
  { slug: "merced",        name: "88baobao Merced",        addr: "3564 G St",                         city: "Merced",        state: "CA", zip: "95340", phone: "(209) 749-2114", status: "open" },
  { slug: "roseville",     name: "88baobao Roseville",     addr: "4181 Thrive Dr Ste 140",            city: "Roseville",     state: "CA", zip: "95678", phone: "(916) 773-0310", status: "open" },
  { slug: "vacaville",     name: "88baobao Vacaville",     addr: "1639 E Monte Vista Ave Ste 105",    city: "Vacaville",     state: "CA", zip: "95688", phone: "(707) 474-5602", status: "open" },
  { slug: "vallejo",       name: "88baobao Vallejo",       addr: "145 Plaza Dr #209",                 city: "Vallejo",       state: "CA", zip: "94591", phone: "(707) 563-5196", status: "open" },
  { slug: "castro-valley", name: "88baobao Castro Valley", addr: "3330 Village Dr",                   city: "Castro Valley", state: "CA", zip: "94546", phone: null,             status: "open" },
  { slug: "riverbank",     name: "88baobao Riverbank",     addr: null,                                city: "Riverbank",     state: "CA", zip: null,    phone: null,             status: "opening_soon" },
];

for (const s of STORES) {
  await sql`
    INSERT INTO stores (slug, name_en, address_line1, city, state, zip, phone, status)
    VALUES (${s.slug}, ${s.name}, ${s.addr}, ${s.city}, ${s.state}, ${s.zip}, ${s.phone}, ${s.status}::store_status)
    ON CONFLICT (slug) DO UPDATE SET
      name_en = EXCLUDED.name_en,
      address_line1 = EXCLUDED.address_line1,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      zip = EXCLUDED.zip,
      phone = EXCLUDED.phone,
      status = EXCLUDED.status,
      updated_at = NOW()
  `;
}

const counts = await sql`
  SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'open')::int AS open FROM stores
`;
console.log("✓ stores seeded:", counts[0]);
