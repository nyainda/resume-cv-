/**
 * geo.ts — Country tier classification and geo-specific SEO config.
 *
 * Tier strategy (ordered by subscription LTV + volume):
 *   Tier 1  English-speaking, highest ARPU  → US GB CA AU NZ IE
 *   Tier 2  European professionals           → DE NL SE NO CH DK FI AT BE FR
 *   Tier 3  Gulf / MENA professionals        → AE SA QA KW BH OM
 *   Tier 4  APAC professional hubs           → SG HK MY TW JP KR
 *   Tier 5  High-volume emerging markets     → IN NG ZA PH GH KE
 */

export type CountryTier = 1 | 2 | 3 | 4 | 5;

interface CountryConfig {
  tier: CountryTier;
  /** BCP-47 locale used for og:locale and hreflang */
  locale: string;
  /** Override the page <title> suffix. Appended as "ProCV — {suffix}" */
  titleSuffix?: string;
  /** Override meta description for this country */
  description?: string;
  /** Additional keywords relevant to this market */
  keywords?: string[];
  /** Currency symbol hint (used in description overrides) */
  currency?: string;
}

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  // ── Tier 1: English-speaking ────────────────────────────────────────────────
  US: { tier: 1, locale: 'en_US', currency: '$',
    titleSuffix: 'AI Resume & CV Builder for the US Job Market',
    description: 'Build a job-winning resume in minutes with ProCV\'s AI. ATS-optimised for US employers, 35+ templates, cover letters, and interview prep — free to start.',
    keywords: ['resume builder', 'AI resume builder', 'ATS resume', 'professional resume', 'resume maker USA', 'cover letter generator'] },

  GB: { tier: 1, locale: 'en_GB', currency: '£',
    titleSuffix: 'AI CV Builder for the UK Job Market',
    description: 'Create a professional CV that passes ATS screening. ProCV uses AI to tailor your CV for UK employers — 35+ templates, cover letters, interview prep. Free to start.',
    keywords: ['CV builder UK', 'AI CV maker', 'professional CV', 'ATS CV', 'CV template UK', 'cover letter UK', 'best CV builder'] },

  CA: { tier: 1, locale: 'en_CA', currency: '$',
    titleSuffix: 'AI Resume & CV Builder for Canada',
    description: 'Land your next Canadian job faster. ProCV AI builds ATS-friendly resumes tailored to Canadian employers — cover letters, LinkedIn optimisation, interview prep.',
    keywords: ['resume builder Canada', 'CV builder Canada', 'AI resume Canada', 'ATS resume Canada', 'Canadian resume format'] },

  AU: { tier: 1, locale: 'en_AU', currency: '$',
    titleSuffix: 'AI CV Builder for the Australian Job Market',
    description: 'ProCV helps Australian job seekers build ATS-optimised CVs with AI — 35+ templates, cover letters, and interview preparation. Free to start.',
    keywords: ['CV builder Australia', 'resume builder Australia', 'AI CV Australia', 'ATS CV Australia', 'job application Australia'] },

  NZ: { tier: 1, locale: 'en_NZ', currency: '$',
    titleSuffix: 'AI CV Builder for New Zealand',
    description: 'Build a standout CV for the New Zealand job market with AI. ATS-friendly templates, cover letters and interview preparation — all in one place.',
    keywords: ['CV builder NZ', 'resume builder New Zealand', 'AI CV NZ'] },

  IE: { tier: 1, locale: 'en_IE', currency: '€',
    titleSuffix: 'AI CV Builder for Irish Professionals',
    description: 'Create a professional CV tailored to Irish and EU employers. AI-powered, ATS-friendly — cover letters and interview prep included.',
    keywords: ['CV builder Ireland', 'AI CV maker Ireland', 'professional CV Dublin'] },

  // ── Tier 2: European professionals ─────────────────────────────────────────
  DE: { tier: 2, locale: 'de_DE', currency: '€',
    titleSuffix: 'KI-gestützter Lebenslauf-Builder | AI CV Builder Germany',
    description: 'ProCV erstellt professionelle, ATS-optimierte Lebensläufe mit KI — für den deutschen und europäischen Arbeitsmarkt. 35+ Vorlagen, Anschreiben, Interview-Vorbereitung.',
    keywords: ['Lebenslauf erstellen', 'Lebenslauf KI', 'CV builder Germany', 'ATS Lebenslauf', 'Bewerbung KI', 'Anschreiben Generator'] },

  NL: { tier: 2, locale: 'nl_NL', currency: '€',
    titleSuffix: 'AI CV Builder for Dutch Professionals',
    description: 'Build a professional CV optimised for Dutch and European employers with ProCV AI. ATS-friendly templates, cover letters, and interview prep.',
    keywords: ['CV maker Nederland', 'AI CV builder Netherlands', 'sollicitatiebrief generator'] },

  SE: { tier: 2, locale: 'sv_SE', currency: 'kr',
    titleSuffix: 'AI CV Builder for Swedish Professionals',
    description: 'Create ATS-optimised CVs for Swedish and Nordic employers with ProCV AI. Professional templates, cover letters, and interview preparation.',
    keywords: ['CV builder Sverige', 'AI CV Sweden', 'personligt brev generator'] },

  NO: { tier: 2, locale: 'nb_NO', currency: 'kr',
    titleSuffix: 'AI CV Builder for Norwegian Professionals',
    description: 'Build a professional, ATS-friendly CV for Norwegian and Nordic employers with ProCV AI. Free to start.',
    keywords: ['CV builder Norge', 'AI CV Norway', 'jobbsøknad hjelp'] },

  CH: { tier: 2, locale: 'de_CH', currency: 'CHF',
    titleSuffix: 'AI CV Builder for Swiss Professionals',
    description: 'ProCV creates professional, ATS-optimised CVs for the Swiss job market in English, German, French, and Italian. Free to start.',
    keywords: ['CV builder Switzerland', 'Lebenslauf Schweiz', 'AI CV Schweiz'] },

  DK: { tier: 2, locale: 'da_DK', currency: 'kr',
    titleSuffix: 'AI CV Builder for Danish Professionals',
    description: 'Create standout CVs for Danish and Nordic employers with ProCV AI. ATS-friendly, 35+ templates, cover letters included.',
    keywords: ['CV builder Danmark', 'AI CV Denmark', 'ansøgning hjælp'] },

  FI: { tier: 2, locale: 'fi_FI', currency: '€',
    titleSuffix: 'AI CV Builder for Finnish Professionals',
    description: 'Build a professional Finnish CV with AI. ATS-optimised, 35+ templates, cover letters, and interview preparation.',
    keywords: ['CV builder Suomi', 'AI CV Finland', 'ansioluettelo generaattori'] },

  AT: { tier: 2, locale: 'de_AT', currency: '€',
    titleSuffix: 'KI-Lebenslauf-Builder für Österreich',
    description: 'Professionelle, ATS-optimierte Lebensläufe für den österreichischen Arbeitsmarkt — mit KI. Kostenlos starten.',
    keywords: ['Lebenslauf erstellen Österreich', 'CV builder Austria', 'KI Bewerbung Österreich'] },

  BE: { tier: 2, locale: 'fr_BE', currency: '€',
    titleSuffix: 'AI CV Builder for Belgian Professionals',
    description: 'Create professional CVs for Belgian and European employers with ProCV AI. French, Dutch, and English — ATS-optimised.',
    keywords: ['CV builder Belgique', 'CV builder België', 'AI CV Belgium'] },

  FR: { tier: 2, locale: 'fr_FR', currency: '€',
    titleSuffix: 'Créateur de CV IA | AI CV Builder France',
    description: 'ProCV génère des CV professionnels et optimisés ATS avec l\'IA — pour le marché de l\'emploi français et européen. Lettres de motivation et préparation aux entretiens.',
    keywords: ['créer CV en ligne', 'CV IA', 'générateur CV gratuit', 'lettre de motivation IA', 'CV builder France'] },

  // ── Tier 3: Gulf / MENA ─────────────────────────────────────────────────────
  AE: { tier: 3, locale: 'en_AE', currency: 'AED',
    titleSuffix: 'AI CV Builder for UAE & Dubai Professionals',
    description: 'Build a professional CV tailored for UAE and Gulf employers. ProCV AI creates ATS-optimised CVs for Dubai, Abu Dhabi and the broader MENA job market.',
    keywords: ['CV builder UAE', 'resume builder Dubai', 'AI CV Dubai', 'professional CV Abu Dhabi', 'Gulf job CV', 'MENA resume'] },

  SA: { tier: 3, locale: 'ar_SA', currency: 'SAR',
    titleSuffix: 'AI CV Builder for Saudi Arabia | منشئ السيرة الذاتية',
    description: 'Create a professional, ATS-optimised CV for the Saudi Arabian job market with ProCV AI. Supporting Vision 2030 career development.',
    keywords: ['CV builder Saudi Arabia', 'resume builder KSA', 'سيرة ذاتية احترافية', 'AI CV Saudi'] },

  QA: { tier: 3, locale: 'ar_QA', currency: 'QAR',
    titleSuffix: 'AI CV Builder for Qatar Professionals',
    description: 'ProCV AI builds professional CVs for the Qatar job market. ATS-friendly, 35+ templates, cover letters and interview prep.',
    keywords: ['CV builder Qatar', 'resume builder Doha', 'AI CV Qatar'] },

  KW: { tier: 3, locale: 'ar_KW', currency: 'KWD',
    titleSuffix: 'AI CV Builder for Kuwait Professionals',
    description: 'Build a professional CV for the Kuwaiti job market with ProCV AI. ATS-optimised and tailored for Gulf employers.',
    keywords: ['CV builder Kuwait', 'AI resume Kuwait'] },

  BH: { tier: 3, locale: 'ar_BH', currency: 'BHD',
    titleSuffix: 'AI CV Builder for Bahrain Professionals',
    description: 'Create professional CVs for Bahrain and Gulf employers with ProCV AI. Free to start.',
    keywords: ['CV builder Bahrain', 'AI resume Bahrain'] },

  OM: { tier: 3, locale: 'ar_OM', currency: 'OMR',
    titleSuffix: 'AI CV Builder for Oman Professionals',
    description: 'Build a professional, ATS-optimised CV for the Oman job market with ProCV AI.',
    keywords: ['CV builder Oman', 'AI resume Muscat'] },

  // ── Tier 4: APAC professional hubs ─────────────────────────────────────────
  SG: { tier: 4, locale: 'en_SG', currency: 'S$',
    titleSuffix: 'AI CV Builder for Singapore Professionals',
    description: 'Build a professional CV for Singapore\'s competitive job market with ProCV AI. ATS-optimised, 35+ templates, cover letters and interview prep.',
    keywords: ['CV builder Singapore', 'resume builder Singapore', 'AI CV SG', 'MAS job CV'] },

  HK: { tier: 4, locale: 'en_HK', currency: 'HK$',
    titleSuffix: 'AI CV Builder for Hong Kong Professionals',
    description: 'Create professional CVs for Hong Kong employers with ProCV AI. ATS-optimised, bilingual-friendly, 35+ templates.',
    keywords: ['CV builder Hong Kong', 'resume builder HK', 'AI CV Hong Kong'] },

  MY: { tier: 4, locale: 'en_MY', currency: 'RM',
    titleSuffix: 'AI CV Builder for Malaysian Professionals',
    description: 'Build a standout CV for Malaysian employers with ProCV AI. ATS-friendly templates, cover letters, and interview preparation.',
    keywords: ['CV builder Malaysia', 'resume builder Malaysia', 'AI CV Malaysia', 'kerja resume'] },

  JP: { tier: 4, locale: 'ja_JP', currency: '¥',
    titleSuffix: 'AI CV Builder for Japan | 英文履歴書作成',
    description: 'Create professional English CVs and Japanese-market resumes with ProCV AI. ATS-optimised for global companies hiring in Japan.',
    keywords: ['CV builder Japan', '英文CV作成', 'AI resume Japan', '外資系 履歴書'] },

  KR: { tier: 4, locale: 'ko_KR', currency: '₩',
    titleSuffix: 'AI CV Builder for Korea | 영문 이력서 작성',
    description: 'Build professional English CVs for Korean and global employers with ProCV AI. ATS-optimised and tailored for the Korean job market.',
    keywords: ['CV builder Korea', '영문이력서 작성', 'AI 이력서'] },

  TW: { tier: 4, locale: 'zh_TW', currency: 'NT$',
    titleSuffix: 'AI CV Builder for Taiwan Professionals',
    description: 'Create professional CVs for Taiwanese and global employers with ProCV AI. ATS-optimised, 35+ templates.',
    keywords: ['CV builder Taiwan', '履歷表製作', 'AI CV Taiwan'] },

  // ── Tier 5: High-volume emerging markets ────────────────────────────────────
  IN: { tier: 5, locale: 'en_IN', currency: '₹',
    titleSuffix: 'AI Resume & CV Builder for India',
    description: 'Build a job-winning resume for Indian employers with ProCV AI. ATS-optimised for IT, finance, and management roles — free to start.',
    keywords: ['resume builder India', 'CV maker India', 'AI resume India', 'Naukri resume', 'job application India'] },

  NG: { tier: 5, locale: 'en_NG', currency: '₦',
    titleSuffix: 'AI CV Builder for Nigeria',
    description: 'Create professional CVs for Nigerian and international employers with ProCV AI. ATS-friendly, 35+ templates, free to start.',
    keywords: ['CV builder Nigeria', 'resume builder Lagos', 'AI CV Nigeria'] },

  ZA: { tier: 5, locale: 'en_ZA', currency: 'R',
    titleSuffix: 'AI CV Builder for South Africa',
    description: 'Build a professional CV for the South African job market with ProCV AI. ATS-optimised, cover letters and interview prep included.',
    keywords: ['CV builder South Africa', 'resume builder SA', 'AI CV South Africa'] },

  PH: { tier: 5, locale: 'en_PH', currency: '₱',
    titleSuffix: 'AI Resume Builder for the Philippines',
    description: 'Build a professional resume for Philippine employers and international BPO / offshore roles with ProCV AI. ATS-friendly, free to start.',
    keywords: ['resume builder Philippines', 'CV maker PH', 'AI resume Philippines'] },

  GH: { tier: 5, locale: 'en_GH', currency: 'GH₵',
    titleSuffix: 'AI CV Builder for Ghana',
    description: 'Create professional CVs for Ghanaian and international employers with ProCV AI. ATS-friendly, 35+ templates.',
    keywords: ['CV builder Ghana', 'resume builder Accra', 'AI CV Ghana'] },

  KE: { tier: 5, locale: 'en_KE', currency: 'KSh',
    titleSuffix: 'AI CV Builder for Kenya',
    description: 'Build a professional CV for Kenyan and East African employers with ProCV AI. ATS-optimised, free to start.',
    keywords: ['CV builder Kenya', 'resume builder Nairobi', 'AI CV Kenya'] },
};

/** Ordered list of all target country codes — used for hreflang generation */
export const TARGET_COUNTRIES = Object.keys(COUNTRY_CONFIG);

/** Get country config, falling back gracefully */
export function getCountryConfig(countryCode: string): CountryConfig {
  return COUNTRY_CONFIG[countryCode] ?? {
    tier: 5 as CountryTier,
    locale: 'en_US',
  };
}

/** All hreflang entries for <link rel="alternate"> tags */
export function getHreflangEntries(baseUrl: string): Array<{ hreflang: string; href: string }> {
  const entries: Array<{ hreflang: string; href: string }> = [
    { hreflang: 'en', href: baseUrl },
    { hreflang: 'x-default', href: baseUrl },
  ];
  for (const [cc, cfg] of Object.entries(COUNTRY_CONFIG)) {
    // BCP-47: en-US, en-GB, de-DE, etc.
    const lang = cfg.locale.replace('_', '-');
    entries.push({ hreflang: lang, href: baseUrl });
    // Also add bare language code for non-English markets to avoid duplicates
    const bare = lang.split('-')[0];
    if (bare !== 'en' && !entries.some(e => e.hreflang === bare)) {
      entries.push({ hreflang: bare, href: baseUrl });
    }
    void cc;
  }
  return entries;
}
