/**
 * A curated set of airports for the autocomplete. When the backend lands this
 * should be replaced by (or backed with) a lookup endpoint — keep `findAirport`
 * as the single accessor so callers never touch the array directly.
 */
export const airports = [
  // Israel & the region
  { code: 'TLV', city: 'Tel Aviv', country: 'Israel', name: 'Ben Gurion' },
  { code: 'ETM', city: 'Eilat', country: 'Israel', name: 'Ramon' },
  { code: 'HFA', city: 'Haifa', country: 'Israel', name: 'Haifa' },
  { code: 'AMM', city: 'Amman', country: 'Jordan', name: 'Queen Alia' },
  { code: 'LCA', city: 'Larnaca', country: 'Cyprus', name: 'Larnaca' },
  { code: 'PFO', city: 'Paphos', country: 'Cyprus', name: 'Paphos' },
  { code: 'CAI', city: 'Cairo', country: 'Egypt', name: 'Cairo' },
  { code: 'SSH', city: 'Sharm El Sheikh', country: 'Egypt', name: 'Sharm El Sheikh' },
  { code: 'IST', city: 'Istanbul', country: 'Türkiye', name: 'Istanbul' },
  { code: 'SAW', city: 'Istanbul', country: 'Türkiye', name: 'Sabiha Gökçen' },
  { code: 'AYT', city: 'Antalya', country: 'Türkiye', name: 'Antalya' },
  { code: 'DXB', city: 'Dubai', country: 'UAE', name: 'Dubai International' },
  { code: 'AUH', city: 'Abu Dhabi', country: 'UAE', name: 'Zayed International' },
  { code: 'DOH', city: 'Doha', country: 'Qatar', name: 'Hamad International' },
  { code: 'RUH', city: 'Riyadh', country: 'Saudi Arabia', name: 'King Khalid' },
  { code: 'JED', city: 'Jeddah', country: 'Saudi Arabia', name: 'King Abdulaziz' },
  { code: 'BAH', city: 'Manama', country: 'Bahrain', name: 'Bahrain International' },

  // Western Europe
  { code: 'LHR', city: 'London', country: 'United Kingdom', name: 'Heathrow' },
  { code: 'LGW', city: 'London', country: 'United Kingdom', name: 'Gatwick' },
  { code: 'STN', city: 'London', country: 'United Kingdom', name: 'Stansted' },
  { code: 'LTN', city: 'London', country: 'United Kingdom', name: 'Luton' },
  { code: 'MAN', city: 'Manchester', country: 'United Kingdom', name: 'Manchester' },
  { code: 'EDI', city: 'Edinburgh', country: 'United Kingdom', name: 'Edinburgh' },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', name: 'Dublin' },
  { code: 'CDG', city: 'Paris', country: 'France', name: 'Charles de Gaulle' },
  { code: 'ORY', city: 'Paris', country: 'France', name: 'Orly' },
  { code: 'NCE', city: 'Nice', country: 'France', name: 'Côte d’Azur' },
  { code: 'LYS', city: 'Lyon', country: 'France', name: 'Saint-Exupéry' },
  { code: 'MRS', city: 'Marseille', country: 'France', name: 'Provence' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', name: 'Schiphol' },
  { code: 'BRU', city: 'Brussels', country: 'Belgium', name: 'Brussels' },
  { code: 'LUX', city: 'Luxembourg', country: 'Luxembourg', name: 'Findel' },
  { code: 'FRA', city: 'Frankfurt', country: 'Germany', name: 'Frankfurt' },
  { code: 'MUC', city: 'Munich', country: 'Germany', name: 'Munich' },
  { code: 'BER', city: 'Berlin', country: 'Germany', name: 'Brandenburg' },
  { code: 'DUS', city: 'Düsseldorf', country: 'Germany', name: 'Düsseldorf' },
  { code: 'HAM', city: 'Hamburg', country: 'Germany', name: 'Hamburg' },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', name: 'Zurich' },
  { code: 'GVA', city: 'Geneva', country: 'Switzerland', name: 'Geneva' },
  { code: 'VIE', city: 'Vienna', country: 'Austria', name: 'Schwechat' },
  { code: 'MAD', city: 'Madrid', country: 'Spain', name: 'Barajas' },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', name: 'El Prat' },
  { code: 'AGP', city: 'Málaga', country: 'Spain', name: 'Costa del Sol' },
  { code: 'PMI', city: 'Palma de Mallorca', country: 'Spain', name: 'Son Sant Joan' },
  { code: 'VLC', city: 'Valencia', country: 'Spain', name: 'Valencia' },
  { code: 'IBZ', city: 'Ibiza', country: 'Spain', name: 'Ibiza' },
  { code: 'TFS', city: 'Tenerife', country: 'Spain', name: 'Tenerife South' },
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', name: 'Humberto Delgado' },
  { code: 'OPO', city: 'Porto', country: 'Portugal', name: 'Francisco Sá Carneiro' },
  { code: 'FAO', city: 'Faro', country: 'Portugal', name: 'Faro' },
  { code: 'FCO', city: 'Rome', country: 'Italy', name: 'Fiumicino' },
  { code: 'MXP', city: 'Milan', country: 'Italy', name: 'Malpensa' },
  { code: 'BGY', city: 'Milan', country: 'Italy', name: 'Bergamo' },
  { code: 'VCE', city: 'Venice', country: 'Italy', name: 'Marco Polo' },
  { code: 'NAP', city: 'Naples', country: 'Italy', name: 'Capodichino' },
  { code: 'CTA', city: 'Catania', country: 'Italy', name: 'Fontanarossa' },
  { code: 'ATH', city: 'Athens', country: 'Greece', name: 'Eleftherios Venizelos' },
  { code: 'SKG', city: 'Thessaloniki', country: 'Greece', name: 'Makedonia' },
  { code: 'HER', city: 'Heraklion', country: 'Greece', name: 'Nikos Kazantzakis' },
  { code: 'RHO', city: 'Rhodes', country: 'Greece', name: 'Diagoras' },
  { code: 'JTR', city: 'Santorini', country: 'Greece', name: 'Santorini' },
  { code: 'MLA', city: 'Valletta', country: 'Malta', name: 'Malta International' },

  // Northern & Eastern Europe
  { code: 'CPH', city: 'Copenhagen', country: 'Denmark', name: 'Kastrup' },
  { code: 'ARN', city: 'Stockholm', country: 'Sweden', name: 'Arlanda' },
  { code: 'OSL', city: 'Oslo', country: 'Norway', name: 'Gardermoen' },
  { code: 'HEL', city: 'Helsinki', country: 'Finland', name: 'Vantaa' },
  { code: 'KEF', city: 'Reykjavík', country: 'Iceland', name: 'Keflavík' },
  { code: 'WAW', city: 'Warsaw', country: 'Poland', name: 'Chopin' },
  { code: 'KRK', city: 'Kraków', country: 'Poland', name: 'John Paul II' },
  { code: 'PRG', city: 'Prague', country: 'Czechia', name: 'Václav Havel' },
  { code: 'BUD', city: 'Budapest', country: 'Hungary', name: 'Ferenc Liszt' },
  { code: 'OTP', city: 'Bucharest', country: 'Romania', name: 'Henri Coandă' },
  { code: 'SOF', city: 'Sofia', country: 'Bulgaria', name: 'Sofia' },
  { code: 'BEG', city: 'Belgrade', country: 'Serbia', name: 'Nikola Tesla' },
  { code: 'ZAG', city: 'Zagreb', country: 'Croatia', name: 'Franjo Tuđman' },
  { code: 'SPU', city: 'Split', country: 'Croatia', name: 'Split' },
  { code: 'DBV', city: 'Dubrovnik', country: 'Croatia', name: 'Dubrovnik' },
  { code: 'TIA', city: 'Tirana', country: 'Albania', name: 'Mother Teresa' },
  { code: 'RIX', city: 'Riga', country: 'Latvia', name: 'Riga' },
  { code: 'VNO', city: 'Vilnius', country: 'Lithuania', name: 'Vilnius' },
  { code: 'TLL', city: 'Tallinn', country: 'Estonia', name: 'Lennart Meri' },
  { code: 'TBS', city: 'Tbilisi', country: 'Georgia', name: 'Tbilisi' },
  { code: 'EVN', city: 'Yerevan', country: 'Armenia', name: 'Zvartnots' },

  // North America
  { code: 'JFK', city: 'New York', country: 'United States', name: 'John F. Kennedy' },
  { code: 'EWR', city: 'Newark', country: 'United States', name: 'Liberty' },
  { code: 'LGA', city: 'New York', country: 'United States', name: 'LaGuardia' },
  { code: 'BOS', city: 'Boston', country: 'United States', name: 'Logan' },
  { code: 'IAD', city: 'Washington', country: 'United States', name: 'Dulles' },
  { code: 'MIA', city: 'Miami', country: 'United States', name: 'Miami International' },
  { code: 'MCO', city: 'Orlando', country: 'United States', name: 'Orlando' },
  { code: 'ATL', city: 'Atlanta', country: 'United States', name: 'Hartsfield-Jackson' },
  { code: 'ORD', city: 'Chicago', country: 'United States', name: "O'Hare" },
  { code: 'DFW', city: 'Dallas', country: 'United States', name: 'Fort Worth' },
  { code: 'DEN', city: 'Denver', country: 'United States', name: 'Denver' },
  { code: 'LAX', city: 'Los Angeles', country: 'United States', name: 'Los Angeles' },
  { code: 'SFO', city: 'San Francisco', country: 'United States', name: 'San Francisco' },
  { code: 'SEA', city: 'Seattle', country: 'United States', name: 'Tacoma' },
  { code: 'LAS', city: 'Las Vegas', country: 'United States', name: 'Harry Reid' },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', name: 'Pearson' },
  { code: 'YUL', city: 'Montreal', country: 'Canada', name: 'Trudeau' },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', name: 'Vancouver' },
  { code: 'MEX', city: 'Mexico City', country: 'Mexico', name: 'Benito Juárez' },
  { code: 'CUN', city: 'Cancún', country: 'Mexico', name: 'Cancún' },

  // Asia & Oceania
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', name: 'Suvarnabhumi' },
  { code: 'HKT', city: 'Phuket', country: 'Thailand', name: 'Phuket' },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', name: 'Changi' },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'Malaysia', name: 'KLIA' },
  { code: 'DPS', city: 'Bali', country: 'Indonesia', name: 'Ngurah Rai' },
  { code: 'HKG', city: 'Hong Kong', country: 'Hong Kong', name: 'Hong Kong International' },
  { code: 'NRT', city: 'Tokyo', country: 'Japan', name: 'Narita' },
  { code: 'HND', city: 'Tokyo', country: 'Japan', name: 'Haneda' },
  { code: 'ICN', city: 'Seoul', country: 'South Korea', name: 'Incheon' },
  { code: 'PVG', city: 'Shanghai', country: 'China', name: 'Pudong' },
  { code: 'PEK', city: 'Beijing', country: 'China', name: 'Capital' },
  { code: 'DEL', city: 'Delhi', country: 'India', name: 'Indira Gandhi' },
  { code: 'BOM', city: 'Mumbai', country: 'India', name: 'Chhatrapati Shivaji' },
  { code: 'GOI', city: 'Goa', country: 'India', name: 'Dabolim' },
  { code: 'CMB', city: 'Colombo', country: 'Sri Lanka', name: 'Bandaranaike' },
  { code: 'MLE', city: 'Malé', country: 'Maldives', name: 'Velana' },
  { code: 'SYD', city: 'Sydney', country: 'Australia', name: 'Kingsford Smith' },
  { code: 'MEL', city: 'Melbourne', country: 'Australia', name: 'Tullamarine' },
  { code: 'AKL', city: 'Auckland', country: 'New Zealand', name: 'Auckland' },

  // Africa & South America
  { code: 'JNB', city: 'Johannesburg', country: 'South Africa', name: 'O. R. Tambo' },
  { code: 'CPT', city: 'Cape Town', country: 'South Africa', name: 'Cape Town' },
  { code: 'NBO', city: 'Nairobi', country: 'Kenya', name: 'Jomo Kenyatta' },
  { code: 'CMN', city: 'Casablanca', country: 'Morocco', name: 'Mohammed V' },
  { code: 'RAK', city: 'Marrakesh', country: 'Morocco', name: 'Menara' },
  { code: 'ADD', city: 'Addis Ababa', country: 'Ethiopia', name: 'Bole' },
  { code: 'GRU', city: 'São Paulo', country: 'Brazil', name: 'Guarulhos' },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'Brazil', name: 'Galeão' },
  { code: 'EZE', city: 'Buenos Aires', country: 'Argentina', name: 'Ezeiza' },
  { code: 'SCL', city: 'Santiago', country: 'Chile', name: 'Arturo Merino Benítez' },
  { code: 'BOG', city: 'Bogotá', country: 'Colombia', name: 'El Dorado' },
  { code: 'LIM', city: 'Lima', country: 'Peru', name: 'Jorge Chávez' },
]

const byCode = new Map(airports.map((a) => [a.code, a]))

/** Look up an airport by IATA code. Case-insensitive; returns undefined if unknown. */
export function findAirport(code) {
  if (!code) return undefined
  return byCode.get(code.trim().toUpperCase())
}

/** Top `limit` airports matching a free-text query on code, city, country or name. */
export function searchAirports(query, limit = 6) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored = []
  for (const airport of airports) {
    const code = airport.code.toLowerCase()
    const city = airport.city.toLowerCase()

    // Exact code beats code prefix beats city prefix beats anything else.
    let score
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (city.startsWith(q)) score = 2
    else if (city.includes(q) || airport.name.toLowerCase().includes(q)) score = 3
    else if (airport.country.toLowerCase().startsWith(q)) score = 4
    else continue

    scored.push({ airport, score })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.airport.code.localeCompare(b.airport.code))
    .slice(0, limit)
    .map((s) => s.airport)
}
