-- Phase 3.2 — Missing seniority + field combos
-- Each row pairs a seniority level with a field and lists phrases that sound
-- wrong (credibility-breaks) at that level in that field.
-- The brief builder injects these as additional forbidden phrases so the LLM
-- knows exactly what language to avoid.
-- Columns: seniority, field, forbidden_phrases (JSON array of strings)

INSERT OR IGNORE INTO cv_seniority_field_combos (seniority, field, forbidden_phrases) VALUES

-- entry + healthcare_clinical
('entry', 'healthcare_clinical',
 '["managed entire clinical department","led clinical governance strategy","executive-level clinical decisions","presented to hospital board","drove strategic health transformation","oversaw entire nursing division","designed hospital-wide policy","accountable for 50-bed ward independently"]'),

-- entry + education_teaching
('entry', 'education_teaching',
 '["managed 50+ teaching staff","led school-wide curriculum design","drove institutional academic strategy","responsible for entire school budget","executive leadership of faculty","strategic oversight of all programmes","designed national curriculum framework"]'),

-- junior + data_analytics
('junior', 'data_analytics',
 '["architected enterprise-scale data warehouse","led global analytics strategy","managed team of 15 senior analysts","board-level executive reporting","owned entire data governance framework","independently closed $5M analytics contract","directed cross-regional BI transformation"]'),

-- senior + finance
('senior', 'finance',
 '["helped with spreadsheets","assisted senior analyst","supported basic reconciliation","entry-level bookkeeping tasks","helped sort invoices","filed simple returns","ran basic pivot tables","worked under supervision on simple models"]'),

-- lead + product_management
('lead', 'product_management',
 '["helped the product team","supported the product manager","assisted with backlog grooming","was given tasks by PM","helped write user stories","junior contributor to roadmap","observed sprint ceremonies","shadowed product decisions"]'),

-- entry + sales_commercial
('entry', 'sales_commercial',
 '["led enterprise sales organisation","managed P&L of £5M+","independently closed £10M+ deals","directed sales team of 20+","owned national account strategy","drove global revenue targets","managed board-level executive relationships"]'),

-- mid + communications_marketing
('mid', 'communications_marketing',
 '["architected entire global brand strategy from scratch","led marketing organization of 50+","single-handedly managed $50M marketing budget","conceptualized and launched global rebranding","directed all PR and comms for entire group"]'),

-- senior + hr_people
('senior', 'hr_people',
 '["helped with CV screening","assisted HR manager","supported basic onboarding admin","filed basic employment paperwork","helped organise team socials","junior HR admin support","shadowed senior HR partner"]'),

-- mid + tech  (bonus — fill a common gap)
('mid', 'tech',
 '["architected entire enterprise technology stack independently","led team of 30+ engineers as sole decision-maker","directed global engineering strategy","closed $20M enterprise deals","responsible for entire company technical direction without guidance"]'),

-- entry + consulting
('entry', 'consulting',
 '["independently managed $10M+ engagements","led C-suite transformation programmes","directed practice area strategy","owned client P&L of entire office","managed a team of 15 senior consultants","independently developed firm go-to-market strategy"]');
