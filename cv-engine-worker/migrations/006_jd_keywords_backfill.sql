-- Phase G: idempotent backfill of jd_keywords for every cv_field_profiles row.
-- Generated from seeds.json + seeds-expansion.json. Safe to re-run.

UPDATE cv_field_profiles SET jd_keywords = '["scalability","CI/CD","microservices","API","cloud","observability"]' WHERE field = 'tech_software';
UPDATE cv_field_profiles SET jd_keywords = '["AutoCAD","BIM","compliance","tolerance","specification","site"]' WHERE field = 'engineering_civil';
UPDATE cv_field_profiles SET jd_keywords = '["GIS","drip","drought","water resources","crop","NGO partner"]' WHERE field = 'agri_irrigation';
UPDATE cv_field_profiles SET jd_keywords = '["donor","grant","M&E","beneficiary","field","partnership"]' WHERE field = 'ngo_development';
UPDATE cv_field_profiles SET jd_keywords = '["policy","regulation","stakeholder","compliance","reporting"]' WHERE field = 'government_public';
UPDATE cv_field_profiles SET jd_keywords = '["FP&A","forecast","valuation","close","reconciliation","variance"]' WHERE field = 'finance';
UPDATE cv_field_profiles SET jd_keywords = '["brand","campaign","content","SEO","social","channel"]' WHERE field = 'communications_marketing';
UPDATE cv_field_profiles SET jd_keywords = '["regression","panel data","Stata","R","econometrics","policy"]' WHERE field = 'economics_research';
UPDATE cv_field_profiles SET jd_keywords = '["patient","clinical","triage","EMR","HIPAA","protocol","care","nurse","physician"]' WHERE field = 'healthcare_clinical';
UPDATE cv_field_profiles SET jd_keywords = '["curriculum","student","pedagogy","assessment","classroom","learning","syllabus","grade"]' WHERE field = 'education_teaching';
UPDATE cv_field_profiles SET jd_keywords = '["contract","compliance","regulatory","GDPR","litigation","counsel","statute","clause"]' WHERE field = 'legal_compliance';
UPDATE cv_field_profiles SET jd_keywords = '["quota","pipeline","prospect","close","SaaS","B2B","account","territory","deal"]' WHERE field = 'sales_commercial';
UPDATE cv_field_profiles SET jd_keywords = '["product","roadmap","user","PRD","OKR","launch","feature","backlog","sprint","PM"]' WHERE field = 'product_management';
UPDATE cv_field_profiles SET jd_keywords = '["UX","UI","Figma","prototype","user research","wireframe","design system","accessibility"]' WHERE field = 'design_ux';
UPDATE cv_field_profiles SET jd_keywords = '["HR","people","recruiting","onboarding","culture","engagement","L&D","talent"]' WHERE field = 'hr_people';
UPDATE cv_field_profiles SET jd_keywords = '["operations","supply chain","logistics","warehouse","procurement","SLA","vendor","OTIF"]' WHERE field = 'operations_supply';
UPDATE cv_field_profiles SET jd_keywords = '["SQL","Python","dbt","Airflow","BI","dashboard","warehouse","ETL","analytics","data"]' WHERE field = 'data_analytics';
