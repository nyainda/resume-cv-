-- Phase G: idempotent backfill of jd_keywords for every cv_field_profiles row.
-- Generated from seeds.json + seeds-expansion.json. Safe to re-run.

UPDATE cv_field_profiles SET jd_keywords = '["scalability","CI/CD","microservices","API","cloud","observability"]' WHERE field_name = 'tech_software';
UPDATE cv_field_profiles SET jd_keywords = '["AutoCAD","BIM","compliance","tolerance","specification","site"]' WHERE field_name = 'engineering_civil';
UPDATE cv_field_profiles SET jd_keywords = '["GIS","drip","drought","water resources","crop","NGO partner"]' WHERE field_name = 'agri_irrigation';
UPDATE cv_field_profiles SET jd_keywords = '["donor","grant","M&E","beneficiary","field","partnership"]' WHERE field_name = 'ngo_development';
UPDATE cv_field_profiles SET jd_keywords = '["policy","regulation","stakeholder","compliance","reporting"]' WHERE field_name = 'government_public';
UPDATE cv_field_profiles SET jd_keywords = '["FP&A","forecast","valuation","close","reconciliation","variance"]' WHERE field_name = 'finance';
UPDATE cv_field_profiles SET jd_keywords = '["brand","campaign","content","SEO","social","channel"]' WHERE field_name = 'communications_marketing';
UPDATE cv_field_profiles SET jd_keywords = '["regression","panel data","Stata","R","econometrics","policy"]' WHERE field_name = 'economics_research';
UPDATE cv_field_profiles SET jd_keywords = '["patient","clinical","triage","EMR","HIPAA","protocol","care","nurse","physician"]' WHERE field_name = 'healthcare_clinical';
UPDATE cv_field_profiles SET jd_keywords = '["curriculum","student","pedagogy","assessment","classroom","learning","syllabus","grade"]' WHERE field_name = 'education_teaching';
UPDATE cv_field_profiles SET jd_keywords = '["contract","compliance","regulatory","GDPR","litigation","counsel","statute","clause"]' WHERE field_name = 'legal_compliance';
UPDATE cv_field_profiles SET jd_keywords = '["quota","pipeline","prospect","close","SaaS","B2B","account","territory","deal"]' WHERE field_name = 'sales_commercial';
UPDATE cv_field_profiles SET jd_keywords = '["product","roadmap","user","PRD","OKR","launch","feature","backlog","sprint","PM"]' WHERE field_name = 'product_management';
UPDATE cv_field_profiles SET jd_keywords = '["UX","UI","Figma","prototype","user research","wireframe","design system","accessibility"]' WHERE field_name = 'design_ux';
UPDATE cv_field_profiles SET jd_keywords = '["HR","people","recruiting","onboarding","culture","engagement","L&D","talent"]' WHERE field_name = 'hr_people';
UPDATE cv_field_profiles SET jd_keywords = '["operations","supply chain","logistics","warehouse","procurement","SLA","vendor","OTIF"]' WHERE field_name = 'operations_supply';
UPDATE cv_field_profiles SET jd_keywords = '["SQL","Python","dbt","Airflow","BI","dashboard","warehouse","ETL","analytics","data"]' WHERE field_name = 'data_analytics';
