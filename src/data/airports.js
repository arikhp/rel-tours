/**
 * Places the user can search: individual airports, plus metropolitan areas that
 * stand for several airports at once (TYO = NRT + HND, LON = LHR/LGW/STN/LTN/LCY…).
 *
 * Coordinates are approximate — good to a few km, which is invisible at the
 * scale the route globe draws them. They exist to plot the route, not to navigate.
 *
 * `findPlace` / `searchPlaces` are the only accessors; when a lookup service
 * replaces this file, keep those two signatures.
 */
export const airports = [
  // Israel & the region
  { code: 'TLV', city: 'Tel Aviv', country: 'Israel', name: 'Ben Gurion', lat: 32.01, lon: 34.89 },
  { code: 'ETM', city: 'Eilat', country: 'Israel', name: 'Ramon', lat: 29.72, lon: 35.01 },
  { code: 'HFA', city: 'Haifa', country: 'Israel', name: 'Haifa', lat: 32.81, lon: 35.04 },
  { code: 'AMM', city: 'Amman', country: 'Jordan', name: 'Queen Alia', lat: 31.72, lon: 35.99 },
  { code: 'LCA', city: 'Larnaca', country: 'Cyprus', name: 'Larnaca', lat: 34.88, lon: 33.63 },
  { code: 'PFO', city: 'Paphos', country: 'Cyprus', name: 'Paphos', lat: 34.72, lon: 32.49 },
  { code: 'CAI', city: 'Cairo', country: 'Egypt', name: 'Cairo', lat: 30.12, lon: 31.41 },
  { code: 'SSH', city: 'Sharm El Sheikh', country: 'Egypt', name: 'Sharm El Sheikh', lat: 27.98, lon: 34.39 },
  { code: 'IST', city: 'Istanbul', country: 'Türkiye', name: 'Istanbul', lat: 41.26, lon: 28.74 },
  { code: 'SAW', city: 'Istanbul', country: 'Türkiye', name: 'Sabiha Gökçen', lat: 40.9, lon: 29.31 },
  { code: 'AYT', city: 'Antalya', country: 'Türkiye', name: 'Antalya', lat: 36.9, lon: 30.79 },
  { code: 'DXB', city: 'Dubai', country: 'UAE', name: 'Dubai International', lat: 25.25, lon: 55.36 },
  { code: 'AUH', city: 'Abu Dhabi', country: 'UAE', name: 'Zayed International', lat: 24.43, lon: 54.65 },
  { code: 'DOH', city: 'Doha', country: 'Qatar', name: 'Hamad International', lat: 25.27, lon: 51.61 },
  { code: 'RUH', city: 'Riyadh', country: 'Saudi Arabia', name: 'King Khalid', lat: 24.96, lon: 46.7 },
  { code: 'JED', city: 'Jeddah', country: 'Saudi Arabia', name: 'King Abdulaziz', lat: 21.68, lon: 39.16 },
  { code: 'BAH', city: 'Manama', country: 'Bahrain', name: 'Bahrain International', lat: 26.27, lon: 50.63 },

  // United Kingdom & Ireland
  { code: 'LHR', city: 'London', country: 'United Kingdom', name: 'Heathrow', lat: 51.47, lon: -0.45 },
  { code: 'LGW', city: 'London', country: 'United Kingdom', name: 'Gatwick', lat: 51.15, lon: -0.19 },
  { code: 'STN', city: 'London', country: 'United Kingdom', name: 'Stansted', lat: 51.89, lon: 0.24 },
  { code: 'LTN', city: 'London', country: 'United Kingdom', name: 'Luton', lat: 51.87, lon: -0.37 },
  { code: 'LCY', city: 'London', country: 'United Kingdom', name: 'London City', lat: 51.51, lon: 0.06 },
  { code: 'MAN', city: 'Manchester', country: 'United Kingdom', name: 'Manchester', lat: 53.36, lon: -2.27 },
  { code: 'EDI', city: 'Edinburgh', country: 'United Kingdom', name: 'Edinburgh', lat: 55.95, lon: -3.37 },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', name: 'Dublin', lat: 53.43, lon: -6.27 },

  // France, Benelux, Germany, Alps
  { code: 'CDG', city: 'Paris', country: 'France', name: 'Charles de Gaulle', lat: 49.01, lon: 2.55 },
  { code: 'ORY', city: 'Paris', country: 'France', name: 'Orly', lat: 48.73, lon: 2.38 },
  { code: 'NCE', city: 'Nice', country: 'France', name: 'Côte d’Azur', lat: 43.66, lon: 7.21 },
  { code: 'LYS', city: 'Lyon', country: 'France', name: 'Saint-Exupéry', lat: 45.73, lon: 5.08 },
  { code: 'MRS', city: 'Marseille', country: 'France', name: 'Provence', lat: 43.44, lon: 5.22 },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', name: 'Schiphol', lat: 52.31, lon: 4.76 },
  { code: 'BRU', city: 'Brussels', country: 'Belgium', name: 'Brussels', lat: 50.9, lon: 4.48 },
  { code: 'LUX', city: 'Luxembourg', country: 'Luxembourg', name: 'Findel', lat: 49.63, lon: 6.21 },
  { code: 'FRA', city: 'Frankfurt', country: 'Germany', name: 'Frankfurt', lat: 50.03, lon: 8.57 },
  { code: 'MUC', city: 'Munich', country: 'Germany', name: 'Munich', lat: 48.35, lon: 11.79 },
  { code: 'BER', city: 'Berlin', country: 'Germany', name: 'Brandenburg', lat: 52.36, lon: 13.5 },
  { code: 'DUS', city: 'Düsseldorf', country: 'Germany', name: 'Düsseldorf', lat: 51.28, lon: 6.76 },
  { code: 'HAM', city: 'Hamburg', country: 'Germany', name: 'Hamburg', lat: 53.63, lon: 9.99 },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', name: 'Zurich', lat: 47.46, lon: 8.55 },
  { code: 'GVA', city: 'Geneva', country: 'Switzerland', name: 'Geneva', lat: 46.24, lon: 6.11 },
  { code: 'VIE', city: 'Vienna', country: 'Austria', name: 'Schwechat', lat: 48.11, lon: 16.57 },

  // Iberia
  { code: 'MAD', city: 'Madrid', country: 'Spain', name: 'Barajas', lat: 40.47, lon: -3.56 },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', name: 'El Prat', lat: 41.3, lon: 2.08 },
  { code: 'AGP', city: 'Málaga', country: 'Spain', name: 'Costa del Sol', lat: 36.67, lon: -4.5 },
  { code: 'PMI', city: 'Palma de Mallorca', country: 'Spain', name: 'Son Sant Joan', lat: 39.55, lon: 2.74 },
  { code: 'VLC', city: 'Valencia', country: 'Spain', name: 'Valencia', lat: 39.49, lon: -0.48 },
  { code: 'IBZ', city: 'Ibiza', country: 'Spain', name: 'Ibiza', lat: 38.87, lon: 1.37 },
  { code: 'TFS', city: 'Tenerife', country: 'Spain', name: 'Tenerife South', lat: 28.04, lon: -16.57 },
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', name: 'Humberto Delgado', lat: 38.77, lon: -9.13 },
  { code: 'OPO', city: 'Porto', country: 'Portugal', name: 'Francisco Sá Carneiro', lat: 41.24, lon: -8.68 },
  { code: 'FAO', city: 'Faro', country: 'Portugal', name: 'Faro', lat: 37.01, lon: -7.97 },

  // Italy, Greece, Malta
  { code: 'FCO', city: 'Rome', country: 'Italy', name: 'Fiumicino', lat: 41.8, lon: 12.25 },
  { code: 'CIA', city: 'Rome', country: 'Italy', name: 'Ciampino', lat: 41.8, lon: 12.59 },
  { code: 'MXP', city: 'Milan', country: 'Italy', name: 'Malpensa', lat: 45.63, lon: 8.72 },
  { code: 'BGY', city: 'Milan', country: 'Italy', name: 'Bergamo', lat: 45.67, lon: 9.7 },
  { code: 'VCE', city: 'Venice', country: 'Italy', name: 'Marco Polo', lat: 45.51, lon: 12.35 },
  { code: 'NAP', city: 'Naples', country: 'Italy', name: 'Capodichino', lat: 40.88, lon: 14.29 },
  { code: 'CTA', city: 'Catania', country: 'Italy', name: 'Fontanarossa', lat: 37.47, lon: 15.07 },
  { code: 'ATH', city: 'Athens', country: 'Greece', name: 'Eleftherios Venizelos', lat: 37.94, lon: 23.95 },
  { code: 'SKG', city: 'Thessaloniki', country: 'Greece', name: 'Makedonia', lat: 40.52, lon: 22.97 },
  { code: 'HER', city: 'Heraklion', country: 'Greece', name: 'Nikos Kazantzakis', lat: 35.34, lon: 25.18 },
  { code: 'RHO', city: 'Rhodes', country: 'Greece', name: 'Diagoras', lat: 36.41, lon: 28.09 },
  { code: 'JTR', city: 'Santorini', country: 'Greece', name: 'Santorini', lat: 36.4, lon: 25.48 },
  { code: 'MLA', city: 'Valletta', country: 'Malta', name: 'Malta International', lat: 35.86, lon: 14.48 },

  // Northern & Eastern Europe
  { code: 'CPH', city: 'Copenhagen', country: 'Denmark', name: 'Kastrup', lat: 55.62, lon: 12.66 },
  { code: 'ARN', city: 'Stockholm', country: 'Sweden', name: 'Arlanda', lat: 59.65, lon: 17.92 },
  { code: 'OSL', city: 'Oslo', country: 'Norway', name: 'Gardermoen', lat: 60.19, lon: 11.1 },
  { code: 'HEL', city: 'Helsinki', country: 'Finland', name: 'Vantaa', lat: 60.32, lon: 24.96 },
  { code: 'KEF', city: 'Reykjavík', country: 'Iceland', name: 'Keflavík', lat: 63.99, lon: -22.62 },
  { code: 'WAW', city: 'Warsaw', country: 'Poland', name: 'Chopin', lat: 52.17, lon: 20.97 },
  { code: 'KRK', city: 'Kraków', country: 'Poland', name: 'John Paul II', lat: 50.08, lon: 19.79 },
  { code: 'PRG', city: 'Prague', country: 'Czechia', name: 'Václav Havel', lat: 50.1, lon: 14.26 },
  { code: 'BUD', city: 'Budapest', country: 'Hungary', name: 'Ferenc Liszt', lat: 47.44, lon: 19.26 },
  { code: 'OTP', city: 'Bucharest', country: 'Romania', name: 'Henri Coandă', lat: 44.57, lon: 26.1 },
  { code: 'SOF', city: 'Sofia', country: 'Bulgaria', name: 'Sofia', lat: 42.7, lon: 23.41 },
  { code: 'BEG', city: 'Belgrade', country: 'Serbia', name: 'Nikola Tesla', lat: 44.82, lon: 20.31 },
  { code: 'ZAG', city: 'Zagreb', country: 'Croatia', name: 'Franjo Tuđman', lat: 45.74, lon: 16.07 },
  { code: 'SPU', city: 'Split', country: 'Croatia', name: 'Split', lat: 43.54, lon: 16.3 },
  { code: 'DBV', city: 'Dubrovnik', country: 'Croatia', name: 'Dubrovnik', lat: 42.56, lon: 18.27 },
  { code: 'TIA', city: 'Tirana', country: 'Albania', name: 'Mother Teresa', lat: 41.41, lon: 19.72 },
  { code: 'RIX', city: 'Riga', country: 'Latvia', name: 'Riga', lat: 56.92, lon: 23.97 },
  { code: 'VNO', city: 'Vilnius', country: 'Lithuania', name: 'Vilnius', lat: 54.64, lon: 25.29 },
  { code: 'TLL', city: 'Tallinn', country: 'Estonia', name: 'Lennart Meri', lat: 59.41, lon: 24.83 },
  { code: 'TBS', city: 'Tbilisi', country: 'Georgia', name: 'Tbilisi', lat: 41.67, lon: 44.95 },
  { code: 'EVN', city: 'Yerevan', country: 'Armenia', name: 'Zvartnots', lat: 40.15, lon: 44.4 },

  // North America
  { code: 'JFK', city: 'New York', country: 'United States', name: 'John F. Kennedy', lat: 40.64, lon: -73.78 },
  { code: 'EWR', city: 'New York', country: 'United States', name: 'Newark Liberty', lat: 40.69, lon: -74.17 },
  { code: 'LGA', city: 'New York', country: 'United States', name: 'LaGuardia', lat: 40.78, lon: -73.87 },
  { code: 'BOS', city: 'Boston', country: 'United States', name: 'Logan', lat: 42.36, lon: -71.01 },
  { code: 'IAD', city: 'Washington', country: 'United States', name: 'Dulles', lat: 38.95, lon: -77.46 },
  { code: 'DCA', city: 'Washington', country: 'United States', name: 'Reagan National', lat: 38.85, lon: -77.04 },
  { code: 'BWI', city: 'Washington', country: 'United States', name: 'Baltimore/Washington', lat: 39.18, lon: -76.67 },
  { code: 'MIA', city: 'Miami', country: 'United States', name: 'Miami International', lat: 25.79, lon: -80.29 },
  { code: 'MCO', city: 'Orlando', country: 'United States', name: 'Orlando', lat: 28.43, lon: -81.31 },
  { code: 'ATL', city: 'Atlanta', country: 'United States', name: 'Hartsfield-Jackson', lat: 33.64, lon: -84.43 },
  { code: 'ORD', city: 'Chicago', country: 'United States', name: "O'Hare", lat: 41.98, lon: -87.9 },
  { code: 'MDW', city: 'Chicago', country: 'United States', name: 'Midway', lat: 41.79, lon: -87.75 },
  { code: 'DFW', city: 'Dallas', country: 'United States', name: 'Fort Worth', lat: 32.9, lon: -97.04 },
  { code: 'DEN', city: 'Denver', country: 'United States', name: 'Denver', lat: 39.86, lon: -104.67 },
  { code: 'LAX', city: 'Los Angeles', country: 'United States', name: 'Los Angeles', lat: 33.94, lon: -118.41 },
  { code: 'SFO', city: 'San Francisco', country: 'United States', name: 'San Francisco', lat: 37.62, lon: -122.38 },
  { code: 'SEA', city: 'Seattle', country: 'United States', name: 'Tacoma', lat: 47.45, lon: -122.31 },
  { code: 'LAS', city: 'Las Vegas', country: 'United States', name: 'Harry Reid', lat: 36.08, lon: -115.15 },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', name: 'Pearson', lat: 43.68, lon: -79.63 },
  { code: 'YUL', city: 'Montreal', country: 'Canada', name: 'Trudeau', lat: 45.47, lon: -73.74 },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', name: 'Vancouver', lat: 49.19, lon: -123.18 },
  { code: 'MEX', city: 'Mexico City', country: 'Mexico', name: 'Benito Juárez', lat: 19.44, lon: -99.07 },
  { code: 'CUN', city: 'Cancún', country: 'Mexico', name: 'Cancún', lat: 21.04, lon: -86.87 },

  // Asia
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', name: 'Suvarnabhumi', lat: 13.69, lon: 100.75 },
  { code: 'HKT', city: 'Phuket', country: 'Thailand', name: 'Phuket', lat: 8.11, lon: 98.31 },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', name: 'Changi', lat: 1.36, lon: 103.99 },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'Malaysia', name: 'KLIA', lat: 2.75, lon: 101.71 },
  { code: 'DPS', city: 'Bali', country: 'Indonesia', name: 'Ngurah Rai', lat: -8.75, lon: 115.17 },
  { code: 'HKG', city: 'Hong Kong', country: 'Hong Kong', name: 'Hong Kong International', lat: 22.31, lon: 113.91 },
  { code: 'NRT', city: 'Tokyo', country: 'Japan', name: 'Narita', lat: 35.77, lon: 140.39 },
  { code: 'HND', city: 'Tokyo', country: 'Japan', name: 'Haneda', lat: 35.55, lon: 139.78 },
  { code: 'KIX', city: 'Osaka', country: 'Japan', name: 'Kansai', lat: 34.43, lon: 135.24 },
  { code: 'ITM', city: 'Osaka', country: 'Japan', name: 'Itami', lat: 34.79, lon: 135.44 },
  { code: 'ICN', city: 'Seoul', country: 'South Korea', name: 'Incheon', lat: 37.46, lon: 126.44 },
  { code: 'GMP', city: 'Seoul', country: 'South Korea', name: 'Gimpo', lat: 37.56, lon: 126.8 },
  { code: 'PVG', city: 'Shanghai', country: 'China', name: 'Pudong', lat: 31.14, lon: 121.81 },
  { code: 'PEK', city: 'Beijing', country: 'China', name: 'Capital', lat: 40.08, lon: 116.58 },
  { code: 'PKX', city: 'Beijing', country: 'China', name: 'Daxing', lat: 39.51, lon: 116.41 },
  { code: 'DEL', city: 'Delhi', country: 'India', name: 'Indira Gandhi', lat: 28.56, lon: 77.1 },
  { code: 'BOM', city: 'Mumbai', country: 'India', name: 'Chhatrapati Shivaji', lat: 19.09, lon: 72.87 },
  { code: 'GOI', city: 'Goa', country: 'India', name: 'Dabolim', lat: 15.38, lon: 73.83 },
  { code: 'CMB', city: 'Colombo', country: 'Sri Lanka', name: 'Bandaranaike', lat: 7.18, lon: 79.88 },
  { code: 'MLE', city: 'Malé', country: 'Maldives', name: 'Velana', lat: 4.19, lon: 73.53 },

  // Oceania
  { code: 'SYD', city: 'Sydney', country: 'Australia', name: 'Kingsford Smith', lat: -33.94, lon: 151.18 },
  { code: 'MEL', city: 'Melbourne', country: 'Australia', name: 'Tullamarine', lat: -37.67, lon: 144.84 },
  { code: 'AKL', city: 'Auckland', country: 'New Zealand', name: 'Auckland', lat: -37.01, lon: 174.79 },

  // Africa
  { code: 'JNB', city: 'Johannesburg', country: 'South Africa', name: 'O. R. Tambo', lat: -26.13, lon: 28.24 },
  { code: 'CPT', city: 'Cape Town', country: 'South Africa', name: 'Cape Town', lat: -33.97, lon: 18.6 },
  { code: 'NBO', city: 'Nairobi', country: 'Kenya', name: 'Jomo Kenyatta', lat: -1.32, lon: 36.93 },
  { code: 'CMN', city: 'Casablanca', country: 'Morocco', name: 'Mohammed V', lat: 33.37, lon: -7.59 },
  { code: 'RAK', city: 'Marrakesh', country: 'Morocco', name: 'Menara', lat: 31.61, lon: -8.04 },
  { code: 'ADD', city: 'Addis Ababa', country: 'Ethiopia', name: 'Bole', lat: 8.98, lon: 38.8 },

  // South America
  { code: 'GRU', city: 'São Paulo', country: 'Brazil', name: 'Guarulhos', lat: -23.43, lon: -46.47 },
  { code: 'CGH', city: 'São Paulo', country: 'Brazil', name: 'Congonhas', lat: -23.63, lon: -46.66 },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'Brazil', name: 'Galeão', lat: -22.81, lon: -43.25 },
  { code: 'EZE', city: 'Buenos Aires', country: 'Argentina', name: 'Ezeiza', lat: -34.82, lon: -58.54 },
  { code: 'AEP', city: 'Buenos Aires', country: 'Argentina', name: 'Jorge Newbery', lat: -34.56, lon: -58.42 },
  { code: 'SCL', city: 'Santiago', country: 'Chile', name: 'Arturo Merino Benítez', lat: -33.39, lon: -70.79 },
  { code: 'BOG', city: 'Bogotá', country: 'Colombia', name: 'El Dorado', lat: 4.7, lon: -74.15 },
  { code: 'LIM', city: 'Lima', country: 'Peru', name: 'Jorge Chávez', lat: -12.02, lon: -77.11 },
]

/**
 * Metropolitan areas — one code standing for every airport serving a city, so a
 * search can say "anywhere in Tokyo" rather than committing to Narita or Haneda.
 * Coordinates are the city centre.
 *
 * Only cities whose IATA metro code differs from all of their airport codes are
 * listed. Istanbul and Shanghai are deliberately absent: their metro codes (IST,
 * SHA) collide with an airport code, which would make a typed code ambiguous.
 */
export const metros = [
  { code: 'LON', city: 'London', country: 'United Kingdom', airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY'], lat: 51.51, lon: -0.13 },
  { code: 'PAR', city: 'Paris', country: 'France', airports: ['CDG', 'ORY'], lat: 48.86, lon: 2.35 },
  { code: 'ROM', city: 'Rome', country: 'Italy', airports: ['FCO', 'CIA'], lat: 41.9, lon: 12.5 },
  { code: 'MIL', city: 'Milan', country: 'Italy', airports: ['MXP', 'BGY'], lat: 45.46, lon: 9.19 },
  { code: 'NYC', city: 'New York', country: 'United States', airports: ['JFK', 'EWR', 'LGA'], lat: 40.71, lon: -74.01 },
  { code: 'WAS', city: 'Washington', country: 'United States', airports: ['IAD', 'DCA', 'BWI'], lat: 38.91, lon: -77.04 },
  { code: 'CHI', city: 'Chicago', country: 'United States', airports: ['ORD', 'MDW'], lat: 41.88, lon: -87.63 },
  { code: 'TYO', city: 'Tokyo', country: 'Japan', airports: ['NRT', 'HND'], lat: 35.68, lon: 139.69 },
  { code: 'OSA', city: 'Osaka', country: 'Japan', airports: ['KIX', 'ITM'], lat: 34.69, lon: 135.5 },
  { code: 'SEL', city: 'Seoul', country: 'South Korea', airports: ['ICN', 'GMP'], lat: 37.57, lon: 126.98 },
  { code: 'BJS', city: 'Beijing', country: 'China', airports: ['PEK', 'PKX'], lat: 39.9, lon: 116.41 },
  { code: 'BUE', city: 'Buenos Aires', country: 'Argentina', airports: ['EZE', 'AEP'], lat: -34.6, lon: -58.38 },
  { code: 'SAO', city: 'São Paulo', country: 'Brazil', airports: ['GRU', 'CGH'], lat: -23.55, lon: -46.63 },
]

// Both kinds of place share a shape, so the rest of the app never branches on type.
const places = [
  ...metros.map((m) => ({
    ...m,
    isMetro: true,
    name: `All airports · ${m.airports.join(', ')}`,
  })),
  ...airports.map((a) => ({ ...a, isMetro: false, airports: [a.code] })),
]

const byCode = new Map(places.map((p) => [p.code, p]))

if (import.meta.env?.DEV) {
  // A metro code that shadows an airport code would make typed input ambiguous.
  const airportCodes = new Set(airports.map((a) => a.code))
  for (const m of metros) {
    if (airportCodes.has(m.code)) console.error(`Metro ${m.code} collides with an airport code`)
    for (const child of m.airports) {
      if (!airportCodes.has(child)) console.error(`Metro ${m.code} lists unknown airport ${child}`)
    }
  }
}

/** Look up an airport or metro area by code. Case-insensitive. */
export function findPlace(code) {
  if (!code) return undefined
  return byCode.get(code.trim().toUpperCase())
}

/** The individual airports a code covers — one for an airport, several for a metro. */
export function airportsFor(code) {
  const place = findPlace(code)
  if (!place) return []
  return place.airports.map((c) => byCode.get(c)).filter(Boolean)
}

/** Great-circle distance in km between two place codes; 0 if either is unknown. */
export function distanceKm(fromCode, toCode) {
  const a = findPlace(fromCode)
  const b = findPlace(toCode)
  if (!a || !b) return 0

  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δφ = (b.lat - a.lat) * toRad
  const Δλ = (b.lon - a.lon) * toRad

  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Top `limit` places matching a free-text query on code, city, country or name. */
export function searchPlaces(query, limit = 6) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored = []
  for (const place of places) {
    const code = place.code.toLowerCase()
    const city = place.city.toLowerCase()

    let score
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (city.startsWith(q)) score = 2
    else if (city.includes(q) || place.name.toLowerCase().includes(q)) score = 3
    else if (place.country.toLowerCase().startsWith(q)) score = 4
    else continue

    // On equal footing a metro outranks its own airports: picking "all of Tokyo"
    // is the broader, cheaper search, and the airports sit right beneath it.
    scored.push({ place, score: score * 2 + (place.isMetro ? 0 : 1) })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.place.code.localeCompare(b.place.code))
    .slice(0, limit)
    .map((s) => s.place)
}
