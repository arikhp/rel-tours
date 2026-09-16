/**
 * Airlines operating routes among this site's airports — legacy and low-cost
 * carriers across Europe, the Middle East, North America, East & South Asia,
 * Oceania, South America and Africa. Not exhaustive, just broad enough to
 * cover the regions `airports.js` actually touches.
 *
 * `findAirline` is the only accessor; when a real API supplies airline codes
 * directly, keep its signature.
 */
export const airlines = [
  // Israel & the Middle East
  { code: 'LY', name: 'El Al' },
  { code: 'TK', name: 'Turkish Airlines' },
  { code: 'EK', name: 'Emirates' },
  { code: 'EY', name: 'Etihad Airways' },
  { code: 'QR', name: 'Qatar Airways' },
  { code: 'SV', name: 'Saudia' },
  { code: 'GF', name: 'Gulf Air' },
  { code: 'MS', name: 'EgyptAir' },
  { code: 'RJ', name: 'Royal Jordanian' },
  { code: 'WY', name: 'Oman Air' },
  { code: 'FZ', name: 'flydubai' },
  { code: 'G9', name: 'Air Arabia' },

  // Europe — legacy & flag carriers
  { code: 'LH', name: 'Lufthansa' },
  { code: 'AF', name: 'Air France' },
  { code: 'KL', name: 'KLM' },
  { code: 'BA', name: 'British Airways' },
  { code: 'IB', name: 'Iberia' },
  { code: 'AZ', name: 'ITA Airways' },
  { code: 'A3', name: 'Aegean' },
  { code: 'LX', name: 'Swiss International Air Lines' },
  { code: 'OS', name: 'Austrian Airlines' },
  { code: 'SK', name: 'SAS' },
  { code: 'TP', name: 'TAP Air Portugal' },
  { code: 'LO', name: 'LOT Polish Airlines' },
  { code: 'OK', name: 'Czech Airlines' },
  { code: 'RO', name: 'TAROM' },
  { code: 'JU', name: 'Air Serbia' },

  // Europe — low-cost
  { code: 'W6', name: 'Wizz Air' },
  { code: 'FR', name: 'Ryanair' },
  { code: 'U2', name: 'easyJet' },
  { code: 'VY', name: 'Vueling' },
  { code: 'DY', name: 'Norwegian Air Shuttle' },
  { code: 'HV', name: 'Transavia' },
  { code: 'PC', name: 'Pegasus Airlines' },

  // North America
  { code: 'AA', name: 'American Airlines' },
  { code: 'UA', name: 'United Airlines' },
  { code: 'DL', name: 'Delta Air Lines' },
  { code: 'WN', name: 'Southwest Airlines' },
  { code: 'AS', name: 'Alaska Airlines' },
  { code: 'B6', name: 'JetBlue Airways' },
  { code: 'AC', name: 'Air Canada' },
  { code: 'WS', name: 'WestJet' },
  { code: 'AM', name: 'Aeroméxico' },

  // East & South Asia
  { code: 'JL', name: 'Japan Airlines' },
  { code: 'NH', name: 'All Nippon Airways' },
  { code: 'KE', name: 'Korean Air' },
  { code: 'OZ', name: 'Asiana Airlines' },
  { code: 'CX', name: 'Cathay Pacific' },
  { code: 'CI', name: 'China Airlines' },
  { code: 'BR', name: 'EVA Air' },
  { code: 'CA', name: 'Air China' },
  { code: 'MU', name: 'China Eastern Airlines' },
  { code: 'CZ', name: 'China Southern Airlines' },
  { code: 'TG', name: 'Thai Airways' },
  { code: 'SQ', name: 'Singapore Airlines' },
  { code: 'MH', name: 'Malaysia Airlines' },
  { code: 'GA', name: 'Garuda Indonesia' },
  { code: 'PR', name: 'Philippine Airlines' },
  { code: 'VN', name: 'Vietnam Airlines' },
  { code: 'AI', name: 'Air India' },
  { code: 'UL', name: 'SriLankan Airlines' },

  // Oceania
  { code: 'QF', name: 'Qantas' },
  { code: 'VA', name: 'Virgin Australia' },
  { code: 'NZ', name: 'Air New Zealand' },
  { code: 'JQ', name: 'Jetstar Airways' },

  // South America
  { code: 'LA', name: 'LATAM Airlines' },
  { code: 'AR', name: 'Aerolíneas Argentinas' },
  { code: 'AV', name: 'Avianca' },
  { code: 'CM', name: 'Copa Airlines' },
  { code: 'G3', name: 'Gol Linhas Aéreas' },
  { code: 'AD', name: 'Azul Brazilian Airlines' },

  // Africa
  { code: 'ET', name: 'Ethiopian Airlines' },
  { code: 'SA', name: 'South African Airways' },
  { code: 'KQ', name: 'Kenya Airways' },
  { code: 'AT', name: 'Royal Air Maroc' },
]

const byCode = new Map(airlines.map((a) => [a.code, a]))

/**
 * Look up an airline by code. Case-insensitive, like `findPlace`. Unlike
 * `findPlace`, a miss doesn't return undefined: it falls back to an object
 * whose `name` is the code itself, so a caller can always render `.name`
 * without special-casing an unrecognised carrier.
 */
export function findAirline(code) {
  if (!code) return undefined
  const normalized = code.trim().toUpperCase()
  return byCode.get(normalized) ?? { code: normalized, name: normalized }
}
