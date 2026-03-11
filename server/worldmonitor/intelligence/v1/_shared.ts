/**
 * Shared constants, types, and helpers used by multiple intelligence RPCs.
 */

// ========================================================================
// Constants
// ========================================================================

export const UPSTREAM_TIMEOUT_MS = 55_000;
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODEL = 'llama-3.1-8b-instant';

// ========================================================================
// Tier-1 country definitions (used by risk-scores + country-intel-brief)
// ========================================================================

export const TIER1_COUNTRIES: Record<string, string> = {
  US: 'United States', RU: 'Russia', CN: 'China', UA: 'Ukraine', IR: 'Iran',
  IL: 'Israel', TW: 'Taiwan', KP: 'North Korea', SA: 'Saudi Arabia', TR: 'Turkey',
  PL: 'Poland', DE: 'Germany', FR: 'France', GB: 'United Kingdom', IN: 'India',
  PK: 'Pakistan', SY: 'Syria', YE: 'Yemen', MM: 'Myanmar', VE: 'Venezuela',
  ET: 'Ethiopia',
  AQ: 'Antarctica',
  SE: 'Sweden',
  LA: 'Laos',
  KN: 'Saint Kitts and Nevis',
  AI: 'Anguilla',
  MS: 'Montserrat',
  XC: 'Northern Cyprus',
  XS: 'Somaliland',
  NI: 'Nicaragua',
  PA: 'Panama',
  SR: 'Suriname',
  SZ: 'Eswatini',
  NA: 'Namibia',
  AO: 'Angola',
  BI: 'Burundi',
  GA: 'Gabon',
  BJ: 'Benin',
  TG: 'Togo',
  CI: 'The Ivory Coast',
  SL: 'Sierra Leone',
  SN: 'Senegal',
  GW: 'Guinea-Bissau',
  MA: 'Morocco',
  ML: 'Mali',
  TD: 'Chad',
  TN: 'Tunisia',
  SS: 'South Sudan',
  ME: 'Montenegro',
  KW: 'Kuwait',
  MC: 'Monaco',
  IS: 'Iceland',
  SK: 'Slovakia',
  BA: 'Bosnia and Herzegovina',
  NC: 'New Caledonia',
  VU: 'Vanuatu',
  FO: 'Faroe Islands',
  FK: 'Falkland Islands',
  KY: 'the Cayman Islands',
  BS: 'the Bahamas',
  TC: 'Turks and Caicos Islands',
  BM: 'Bermuda',
  DM: 'Dominica',
  LC: 'Saint Lucia',
  BB: 'Barbados',
  VC: 'St Vincent and Grenadines',
  CV: 'Cape Verde',
  GS: 'South Georgia & South Sandwich Islands',
};

// ========================================================================
// Helpers
// ========================================================================

export { hashString } from '../../../_shared/hash';
