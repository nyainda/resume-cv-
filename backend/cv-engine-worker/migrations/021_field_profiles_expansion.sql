-- Phase 3.1 — 9 missing field profiles
-- Each profile feeds: verb pool selection, metric type guidance, JD keyword
-- weighting, and the seniority+field brief that the generator injects.
-- Columns: field, language_style, preferred_verbs (JSON), avoided_verbs (JSON),
--          metric_types (JSON), jd_keywords (JSON)

INSERT OR IGNORE INTO cv_field_profiles (field, language_style, preferred_verbs, avoided_verbs, metric_types, jd_keywords) VALUES

-- 1. Nursing / Medical
('nursing_medical', 'clinical',
 '["assessed","administered","monitored","documented","collaborated","coordinated","triaged","educated","implemented","evaluated","trained","facilitated"]',
 '["spearheaded","leveraged","architected","ideated","operationalized","synergized"]',
 '["patient load","bed occupancy %","medication error rate","readmission rate","patient satisfaction score","shift hours","procedures performed"]',
 '["patient care","clinical assessment","medication administration","EHR","nursing care plan","triage","infection control","vital signs","patient safety","clinical governance","care pathway","ward management","NMC","OSCE","BLS","IV therapy"]'),

-- 2. Accounting / Audit
('accounting_audit', 'precise',
 '["audited","reconciled","prepared","analysed","reviewed","reported","forecasted","compiled","verified","examined","assessed","filed"]',
 '["disrupted","innovated","pivoted","greenfielded","spearheaded","actioned"]',
 '["revenue figures","cost variance %","audit findings","budget vs actual","days payable","days receivable","error rate","tax liability","provision amount"]',
 '["financial statements","IFRS","GAAP","audit","reconciliation","tax","accounts payable","accounts receivable","budget","financial reporting","internal controls","external audit","working papers","trial balance","VAT","transfer pricing","CPA","ACCA","ACA"]'),

-- 3. Hospitality / Tourism
('hospitality_tourism', 'service_oriented',
 '["coordinated","managed","delivered","resolved","exceeded","trained","welcomed","supervised","scheduled","ensured","maintained","grew"]',
 '["architected","conceptualized","ideated","spearheaded","leveraged","disrupted"]',
 '["occupancy rate","guest satisfaction score (GSS)","revenue per available room (RevPAR)","covers per shift","upsell revenue","Net Promoter Score","check-in turnaround time"]',
 '["guest experience","front desk","food and beverage","housekeeping","reservations","hospitality","customer service","point of sale","RevPAR","hotel operations","event management","F&B","concierge","rooms division","STR report","TripAdvisor score","MICROS","Opera PMS"]'),

-- 4. Real Estate / Property
('real_estate_property', 'commercial',
 '["negotiated","brokered","managed","valued","leased","sold","developed","acquired","marketed","conducted","closed","advised"]',
 '["ideated","greenfielded","disrupted","actioned","synergized","operationalized"]',
 '["transaction value","portfolio size (sqm/units)","rental yield %","occupancy rate","capital value","GDV","ROI","net yield","days on market"]',
 '["property management","leasing","sales","valuation","real estate","tenant relations","due diligence","portfolio","residential","commercial","conveyancing","RICS","surveying","yield","asset management","MRICS","lettings","title search","planning permission"]'),

-- 5. Media / Journalism
('media_journalism', 'narrative',
 '["reported","wrote","produced","edited","published","covered","investigated","researched","broadcast","pitched","scripted","curated"]',
 '["leveraged","operationalized","synergized","actioned","ideated","spearheaded"]',
 '["monthly unique visitors","page views","engagement rate","social media reach","article count","broadcast reach","subscriber growth","ad revenue"]',
 '["journalism","editorial","content creation","investigative","reporting","news","media production","copywriting","social media","SEO","digital media","print","broadcast","AP Style","Verizon Media","press freedom","sub-editing","fact-checking","content management system","CMS"]'),

-- 6. Construction / Site
('construction_site', 'practical',
 '["managed","supervised","delivered","built","coordinated","completed","ensured","scheduled","inspected","procured","directed","installed"]',
 '["architected","ideated","greenfielded","spearheaded","operationalized","synergized"]',
 '["project value","cost savings","completion %","programme milestones","defect rate","safety incident rate (LTIFR)","subcontractor count","m² completed"]',
 '["construction management","site supervisor","health and safety","project delivery","subcontractors","quantity surveying","tender","building regulations","CSCS","NVQ","programme","AutoCAD","Revit","BIM","CDM","ISO 45001","SMSTS","SSSTS","preliminaries","BOQ"]'),

-- 7. Customer Success
('customer_success', 'relationship_driven',
 '["onboarded","retained","expanded","resolved","managed","grew","supported","partnered","advocated","escalated","trained","renewed"]',
 '["architected","disrupted","greenfielded","ideated","operationalized","spearheaded"]',
 '["Net Promoter Score (NPS)","churn rate %","ARR expansion","renewal rate %","customer health score","time to value (TTV)","logo retention","GRR","NRR"]',
 '["customer success","onboarding","retention","churn","NPS","renewal","upsell","account management","SaaS","CRM","Salesforce","Gainsight","ChurnZero","QBR","business review","customer health","expansion revenue","CSM","product adoption"]'),

-- 8. Research / Academia
('research_academia', 'scholarly',
 '["researched","published","analysed","investigated","designed","conducted","supervised","presented","collaborated","developed","evaluated","taught"]',
 '["spearheaded","disrupted","leveraged","actioned","operationalized","greenfielded"]',
 '["publications count","citations","H-index","grant value","student numbers","impact factor","funding awarded","conference presentations"]',
 '["research","publications","peer-reviewed","grant funding","curriculum","teaching","supervision","laboratory","methodology","data analysis","SPSS","R","qualitative","quantitative","ethics committee","literature review","PhD","postdoc","STEM","REF","ORCID","ResearchGate"]'),

-- 9. Supply Chain / Logistics
('supply_chain_logistics', 'operational',
 '["optimised","managed","coordinated","reduced","implemented","sourced","negotiated","streamlined","forecasted","monitored","tracked","consolidated"]',
 '["disrupted","greenfielded","ideated","spearheaded","operationalized","leveraged"]',
 '["cost savings ($/%)", "lead time reduction","inventory turnover","on-time delivery %","order fill rate","freight cost per unit","supplier performance score","days inventory outstanding (DIO)"]',
 '["supply chain","logistics","procurement","inventory management","ERP","SAP","warehouse","distribution","vendor management","forecasting","demand planning","INCOTERMS","3PL","freight","import/export","customs","CIPS","lean","six sigma","S&OP","last-mile delivery"]');
