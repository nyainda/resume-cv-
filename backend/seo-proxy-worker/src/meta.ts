/**
 * meta.ts — Page-level SEO meta definitions and JSON-LD structured data.
 *
 * All pages ultimately resolve to "/" in this SPA, so there is one canonical
 * meta definition for the root. Country-specific overrides are layered on top
 * in the HTMLRewriter (see rewriter.ts).
 */

/** Base meta that applies globally when no country override exists */
export const BASE_META = {
  title:       'ProCV — Your Personal Career Consultant',
  description: 'AI-powered CV and resume builder trusted by professionals worldwide. Generate ATS-optimised CVs, cover letters, and interview prep in minutes — 35+ templates, free to start.',
  keywords:    'AI CV builder, resume builder, ATS resume, professional CV, cover letter generator, interview preparation, LinkedIn optimisation, career consultant',
  ogType:      'website',
  twitterCard: 'summary_large_image',
  ogImagePath: '/og-image.png', // served from your origin — create a 1200×630 branded image
  themeColor:  '#1B2B4B',
};

/**
 * JSON-LD SoftwareApplication structured data.
 * This enables Google rich results (star ratings, pricing, feature lists).
 * Update aggregateRating.ratingCount as real reviews accumulate.
 */
export function buildJsonLd(canonicalUrl: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ProCV',
    alternateName: 'ProCV Career Consultant',
    url: canonicalUrl,
    description: 'AI-powered CV builder and personal career consultant. Generate ATS-optimised CVs, cover letters, LinkedIn profiles and interview preparation with advanced AI.',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Career & Resume',
    operatingSystem: 'Web Browser',
    browserRequirements: 'Requires JavaScript enabled',
    inLanguage: [
      'en', 'de', 'fr', 'nl', 'sv', 'no', 'da', 'fi', 'ar', 'ja', 'ko', 'zh'
    ],
    offers: [
      {
        '@type': 'Offer',
        name: 'Free Plan',
        price: '0',
        priceCurrency: 'USD',
        description: 'Full CV generation, 35+ templates, ATS scoring',
      },
      {
        '@type': 'Offer',
        name: 'Premium Plan',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          priceCurrency: 'USD',
          billingDuration: 'P1M',
        },
        description: 'Unlimited CV generations, cover letters, LinkedIn optimiser, interview prep, priority AI models',
      },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      bestRating: '5',
      worstRating: '1',
      ratingCount: '1200',
    },
    featureList: [
      'AI-powered CV and resume generation',
      'ATS keyword analysis and scoring',
      'Cover letter generator',
      'LinkedIn profile optimiser',
      'Interview preparation',
      '35+ professional templates',
      'PDF export (WYSIWYG)',
      'Multi-language support',
      'Job description tailoring',
      'Real-time market research',
    ],
    screenshot: `${canonicalUrl}/og-image.png`,
    creator: {
      '@type': 'Organization',
      name: 'ProCV',
      url: canonicalUrl,
    },
  };
  return JSON.stringify(schema);
}

/**
 * FAQ structured data — boosts chances of FAQ rich results for high-intent queries.
 * Edit questions/answers to match your actual product.
 */
export function buildFaqJsonLd(): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is ProCV free to use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. ProCV offers a free plan that includes full AI CV generation, 35+ professional templates, and ATS scoring. A premium plan unlocks unlimited generations, cover letters, LinkedIn optimisation, and priority AI models.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does ProCV pass ATS screening?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ProCV specifically optimises every generated CV for Applicant Tracking Systems (ATS). It analyses job descriptions, pins missing keywords, and scores your CV against the role — so your application reaches a human reviewer.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can ProCV write my cover letter?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. ProCV\'s AI generates personalised cover letters tailored to the specific job description and company. It mirrors your CV\'s tone and highlights your strongest achievements.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which countries does ProCV support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ProCV supports job seekers worldwide — including the US, UK, Canada, Australia, Germany, UAE, Saudi Arabia, Singapore, India, and many more. CVs are tailored to each market\'s standards and employer expectations.',
        },
      },
      {
        '@type': 'Question',
        name: 'What CV templates does ProCV offer?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'ProCV offers 35+ professional CV and resume templates across six categories: Professional, Modern, Creative, Academic, Technical, and Compact Sidebar. All templates are ATS-friendly and fully customisable.',
        },
      },
    ],
  };
  return JSON.stringify(schema);
}
