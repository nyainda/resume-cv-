#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const expansion = {
    cv_verbs: [],
    cv_banned_phrases: [],
    cv_openers: [],
    cv_context_connectors: [],
    cv_result_connectors: [],
    cv_sentence_structures: [],
    cv_rhythm_patterns: [],
    cv_field_profiles: [],
    cv_voice_profiles: [],
    cv_seniority_field_combos: [],
};

function v(present, past, category, energy, score) {
    expansion.cv_verbs.push({ verb_present: present, verb_past: past, category, energy_level: energy, human_score: score });
}

const TECH = [
    ['Codes','Coded','medium',8],['Refactors','Refactored','high',9],['Debugs','Debugged','medium',8],
    ['Optimises','Optimised','high',9],['Profiles','Profiled','medium',8],['Caches','Cached','medium',8],
    ['Indexes','Indexed','medium',8],['Migrates','Migrated','high',9],['Provisions','Provisioned','high',9],
    ['Containerises','Containerised','high',8],['Orchestrates','Orchestrated','high',9],['Monitors','Monitored','medium',8],
    ['Instruments','Instrumented','high',9],['Hardens','Hardened','high',9],['Patches','Patched','medium',8],
    ['Releases','Released','high',9],['Versions','Versioned','medium',7],['Tests','Tested','medium',8],
    ['Mocks','Mocked','medium',7],['Stubs','Stubbed','medium',7],['Lints','Linted','medium',7],
    ['Documents','Documented','medium',8],['Pairs','Paired','medium',7],['Reviews','Reviewed','medium',8],
    ['Wires','Wired','medium',8],['Integrates','Integrated','high',9],['Decouples','Decoupled','high',9],
    ['Encrypts','Encrypted','high',9],['Authenticates','Authenticated','medium',8],['Authorises','Authorised','medium',8],
    ['Streams','Streamed','high',9],['Batches','Batched','medium',8],['Queues','Queued','medium',7],
    ['Schedules','Scheduled','medium',8],['Backports','Backported','medium',7],['Bootstraps','Bootstrapped','high',9],
    ['Forks','Forked','medium',7],['Patched','Patched','medium',7],['Tunes','Tuned','high',8],
    ['Benchmarks','Benchmarked','high',9],['Replays','Replayed','medium',7],['Sanitises','Sanitised','high',8],
];
TECH.forEach(([p,pa,e,s])=>v(p,pa,'technical',e,s));

const MGMT = [
    ['Coaches','Coached','high',9],['Trains','Trained','medium',8],['Recruits','Recruited','high',9],
    ['Onboards','Onboarded','medium',8],['Promotes','Promoted','high',8],['Reorganises','Reorganised','high',9],
    ['Restructures','Restructured','high',9],['Aligns','Aligned','medium',8],['Negotiates','Negotiated','high',9],
    ['Resolves','Resolved','high',8],['Escalates','Escalated','medium',7],['Approves','Approved','medium',7],
    ['Budgets','Budgeted','medium',8],['Forecasts','Forecast','high',9],['Plans','Planned','medium',8],
    ['Roadmaps','Roadmapped','high',9],['Prioritises','Prioritised','high',9],['Sequences','Sequenced','medium',8],
    ['Delegates','Delegated','medium',7],['Empowers','Empowered','medium',7],['Sponsors','Sponsored','high',8],
    ['Steers','Steered','high',8],['Champions','Championed','medium',8],['Convenes','Convened','medium',8],
    ['Facilitates','Facilitated','medium',7],['Brokered','Brokered','high',9],['Reconciles','Reconciled','medium',8],
    ['Audits','Audited','high',9],['Governs','Governed','high',9],['Standardises','Standardised','high',9],
    ['Benchmarks','Benchmarked','high',9],['Operationalises','Operationalised','high',9],['Centralises','Centralised','medium',8],
    ['Decentralises','Decentralised','medium',8],['Mentored','Mentored','high',9],['Backed','Backed','medium',7],
    ['Briefed','Briefed','medium',8],['Debriefed','Debriefed','medium',8],['Aligned','Aligned','medium',8],
];
MGMT.forEach(([p,pa,e,s])=>v(p,pa,'management',e,s));

const ANALYSIS = [
    ['Models','Modelled','high',9],['Forecasts','Forecast','high',9],['Quantifies','Quantified','high',9],
    ['Profiles','Profiled','high',8],['Segments','Segmented','medium',8],['Clusters','Clustered','medium',8],
    ['Classifies','Classified','medium',8],['Predicts','Predicted','high',9],['Diagnoses','Diagnosed','high',9],
    ['Investigates','Investigated','medium',8],['Audits','Audited','high',9],['Validates','Validated','high',9],
    ['Verifies','Verified','medium',8],['Reconciles','Reconciled','high',9],['Synthesises','Synthesised','high',9],
    ['Evaluates','Evaluated','medium',8],['Assesses','Assessed','medium',8],['Benchmarks','Benchmarked','high',9],
    ['Measures','Measured','medium',8],['Tracks','Tracked','medium',8],['Reports','Reported','medium',7],
    ['Visualises','Visualised','high',9],['Interprets','Interpreted','medium',8],['Maps','Mapped','medium',8],
    ['Surveys','Surveyed','medium',8],['Sampled','Sampled','medium',7],['Cross-checks','Cross-checked','medium',8],
    ['Correlates','Correlated','high',9],['Detects','Detected','medium',8],['Flags','Flagged','medium',7],
    ['Triages','Triaged','high',9],['Backtests','Backtested','high',9],
];
ANALYSIS.forEach(([p,pa,e,s])=>v(p,pa,'analysis',e,s));

const COMMS = [
    ['Writes','Wrote','medium',8],['Edits','Edited','medium',8],['Publishes','Published','high',8],
    ['Pitches','Pitched','high',9],['Presents','Presented','high',8],['Briefs','Briefed','medium',8],
    ['Debriefs','Debriefed','medium',8],['Translates','Translated','medium',8],['Interprets','Interpreted','medium',7],
    ['Negotiates','Negotiated','high',9],['Mediates','Mediated','high',9],['Liaises','Liaised','low',6],
    ['Convenes','Convened','medium',8],['Hosts','Hosted','medium',7],['Moderated','Moderated','medium',8],
    ['Crafts','Crafted','medium',8],['Drafts','Drafted','medium',8],['Composes','Composed','medium',8],
    ['Storytells','Storytold','high',9],['Narrates','Narrated','medium',7],['Trains','Trained','medium',8],
    ['Coaches','Coached','high',8],['Educates','Educated','medium',8],['Engages','Engaged','medium',7],
    ['Mobilises','Mobilised','high',9],['Recruits','Recruited','high',8],['Persuades','Persuaded','high',9],
    ['Influences','Influenced','high',9],['Communicates','Communicated','low',6],['Advocates','Advocated','high',9],
    ['Lobbied','Lobbied','high',8],['Fundraised','Fundraised','high',9],
];
COMMS.forEach(([p,pa,e,s])=>v(p,pa,'communication',e,s));

const FIN = [
    ['Underwrites','Underwrote','high',9],['Models','Modelled','high',9],['Forecasts','Forecast','high',9],
    ['Budgets','Budgeted','high',9],['Reconciles','Reconciled','high',9],['Audits','Audited','high',9],
    ['Closes','Closed','high',9],['Forecasted','Forecasted','high',8],['Reports','Reported','medium',8],
    ['Files','Filed','medium',7],['Reviews','Reviewed','medium',8],['Approves','Approved','medium',8],
    ['Disburses','Disbursed','medium',8],['Collects','Collected','medium',7],['Invoices','Invoiced','medium',7],
    ['Capitalises','Capitalised','high',8],['Amortises','Amortised','medium',8],['Hedges','Hedged','high',9],
    ['Trades','Traded','high',9],['Settles','Settled','medium',8],['Clears','Cleared','medium',8],
    ['Risk-rates','Risk-rated','high',9],['Stress-tests','Stress-tested','high',9],['Backtests','Backtested','high',9],
    ['Prices','Priced','high',8],['Negotiates','Negotiated','high',9],['Brokered','Brokered','high',9],
    ['Raised','Raised','high',9],['Closed','Closed','high',9],['Saved','Saved','high',9],
    ['Cut','Cut','high',9],['Doubled','Doubled','high',10],['Tripled','Tripled','high',10],
];
FIN.forEach(([p,pa,e,s])=>v(p,pa,'financial',e,s));

const CREATIVE = [
    ['Sketched','Sketched','medium',8],['Storyboarded','Storyboarded','high',9],['Prototyped','Prototyped','high',9],
    ['Wireframed','Wireframed','medium',8],['Mocked','Mocked','medium',8],['Composed','Composed','medium',8],
    ['Choreographed','Choreographed','high',9],['Directed','Directed','high',9],['Produced','Produced','high',9],
    ['Edited','Edited','medium',8],['Animated','Animated','high',9],['Rendered','Rendered','medium',8],
    ['Filmed','Filmed','medium',8],['Photographed','Photographed','medium',8],['Illustrated','Illustrated','medium',8],
    ['Branded','Branded','high',9],['Rebranded','Rebranded','high',9],['Themed','Themed','medium',7],
    ['Curated','Curated','medium',8],['Crafted','Crafted','medium',8],['Designed','Designed','high',9],
    ['Conceived','Conceived','high',8],['Imagined','Imagined','medium',7],['Reimagined','Reimagined','high',9],
    ['Pitched','Pitched','high',9],['Sold','Sold','high',9],['Launched','Launched','high',9],
];
CREATIVE.forEach(([p,pa,e,s])=>v(p,pa,'creative',e,s));

// ── Banned phrases (massive expansion) ───────────────────────────────────────
function b(phrase, replacement, severity, reason) {
    expansion.cv_banned_phrases.push({ phrase, replacement, severity, reason });
}
const BANNED = [
    // AI tells
    ['delve','explore','critical','AI tell'],['delve into','explore','critical','AI tell'],
    ['delving','exploring','critical','AI tell'],['delves','explores','critical','AI tell'],
    ['seamlessly','smoothly','high','AI tell'],['seamless','smooth','high','AI tell'],
    ['holistic','complete','high','buzzword'],['holistically','fully','high','buzzword'],
    ['paradigm','approach','high','buzzword'],['paradigms','approaches','high','buzzword'],
    ['paradigm shift','major change','critical','buzzword'],['game-changer','breakthrough','critical','buzzword'],
    ['game-changing','breakthrough','critical','buzzword'],['transformative','meaningful','critical','buzzword'],
    ['revolutionary','novel','critical','buzzword'],['revolutionised','overhauled','high','buzzword'],
    ['groundbreaking','novel','critical','buzzword'],['pioneering','first','high','buzzword'],
    ['unprecedented','first','high','buzzword'],['unparalleled','rare','high','buzzword'],
    ['next-generation','newer','high','buzzword'],['next-gen','newer','high','buzzword'],
    ['bleeding-edge','newer','high','buzzword'],['mission-critical','important','medium','buzzword'],
    ['business-critical','important','medium','buzzword'],['turn-key','ready','medium','buzzword'],
    ['turnkey','ready','medium','buzzword'],['plug-and-play','simple','medium','buzzword'],
    ['low-hanging fruit','easy wins','high','cliche'],['move the needle','make an impact','high','cliche'],
    ['moving the needle','making an impact','high','cliche'],['boil the ocean','overreach','medium','cliche'],
    ["take it to the next level",'improve it','high','cliche'],['next level','improve','medium','cliche'],
    ['win-win','mutual','medium','cliche'],['no-brainer','obvious','medium','cliche'],
    ['top-notch','strong','high','cliche'],['top-tier','leading','medium','cliche'],
    ['rockstar','expert','high','cliche'],['ninja','expert','high','cliche'],
    ['guru','expert','high','cliche'],['wizard','expert','high','cliche'],
    ['10x','high-impact','high','cliche'],['10x engineer','high-impact engineer','high','cliche'],
    // Vague filler
    ['various','many','medium','wordy'],['numerous','many','medium','wordy'],
    ['several','a few','medium','wordy'],['multiple','many','low','wordy'],
    ['etc.','','low','wordy'],['etcetera','','low','wordy'],
    ['as well as','and','medium','wordy'],['including but not limited to','including','medium','wordy'],
    ['both','','low','wordy'],['some','','low','wordy'],
    ['quite','','low','wordy'],['really','','low','wordy'],
    ['very','','medium','wordy'],['actually','','low','wordy'],
    ['basically','','medium','wordy'],['simply','','medium','wordy'],
    ['just','','low','wordy'],['literally','','medium','wordy'],
    // Soft/weak phrasing
    ['helped to','helped','medium','wordy'],['worked on','built','high','vague'],
    ['worked with','partnered with','medium','vague'],['involved in','contributed to','high','vague'],
    ['participated in','contributed to','high','vague'],['contributed to','drove','medium','vague'],
    ['exposed to','learned','high','vague'],['familiar with','used','medium','vague'],
    ['knowledge of','experience with','medium','vague'],['understanding of','experience with','medium','vague'],
    ['hands-on experience','built','medium','vague'],['gained experience','built','medium','vague'],
    ['proven ability to','','high','filler'],['demonstrated ability to','','high','filler'],
    ['ability to','','medium','filler'],['skilled in','use','medium','filler'],
    // Performance cliches
    ['best-in-class','leading','high','buzzword'],['industry-leading','leading','high','buzzword'],
    ['market-leading','top','high','buzzword'],['world-renowned','recognised','high','buzzword'],
    ['highly motivated','motivated','high','cliche'],['highly skilled','skilled','high','cliche'],
    ['highly experienced','experienced','high','cliche'],['extensive experience','years of experience','medium','cliche'],
    ['vast experience','years of experience','medium','cliche'],['deep expertise','expertise','medium','cliche'],
    ['proven expertise','expertise','medium','cliche'],['solid background','background','medium','cliche'],
    ['strong background','background','medium','cliche'],['solid foundation','foundation','medium','cliche'],
    ['well-versed in','use','medium','cliche'],['fluent in','use','medium','cliche'],
    // Hype words
    ['amazing','strong','high','hype'],['awesome','strong','high','hype'],
    ['incredible','strong','high','hype'],['phenomenal','strong','high','hype'],
    ['outstanding','strong','high','hype'],['exceptional','strong','high','hype'],
    ['stellar','strong','high','hype'],['superb','strong','high','hype'],
    ['fantastic','strong','high','hype'],['remarkable','strong','high','hype'],
    ['extraordinary','strong','high','hype'],['unprecedented','first','high','hype'],
    // Compound buzz
    ['drive innovation','create new products','high','buzzword'],['driving innovation','creating new products','high','buzzword'],
    ['foster innovation','encourage new ideas','high','buzzword'],['foster collaboration','build collaboration','medium','buzzword'],
    ['foster a culture','build a culture','medium','buzzword'],['foster relationships','build relationships','medium','buzzword'],
    ['cultivate relationships','build relationships','medium','buzzword'],['nurture relationships','grow relationships','medium','buzzword'],
    ['build rapport','build trust','medium','cliche'],['establish rapport','build trust','medium','cliche'],
    ['fast-paced environment','busy team','high','cliche'],['fast-paced','busy','medium','cliche'],
    ['high-pressure environment','demanding role','medium','cliche'],['under tight deadlines','on tight deadlines','low','cliche'],
    ['mission-driven','focused','medium','buzzword'],['purpose-driven','focused','medium','buzzword'],
    ['data-driven','data-led','medium','buzzword'],['customer-centric','customer-led','medium','buzzword'],
    ['user-centric','user-led','medium','buzzword'],['human-centric','human-led','medium','buzzword'],
    // Career-stage tells
    ['recent graduate','','medium','redundant'],['fresh graduate','','medium','redundant'],
    ['entry-level','','low','redundant'],['eager to learn','','high','cliche'],
    ['quick learner','','high','cliche'],['fast learner','','high','cliche'],
    ['willing to learn','','high','cliche'],['enthusiastic about','focused on','medium','cliche'],
    ['passionate about','focused on','high','cliche'],['love for','focus on','medium','cliche'],
    ['driven by','motivated by','medium','cliche'],['committed to','focused on','medium','cliche'],
    ['dedicated to','focused on','medium','cliche'],
];
BANNED.forEach(([p,r,s,reason])=>b(p,r,s,reason));

// ── Openers ──────────────────────────────────────────────────────────────────
function op(opener, type, triggers, example, length_type) {
    expansion.cv_openers.push({ opener, type, triggers_comma: triggers, example, length_type });
}
op('At {company},','context',1,'At Safaricom, rebuilt the billing pipeline.','medium');
op('In {year},','time',1,'In 2023, shipped the v2 API.','short');
op('Within {n} months,','time',1,'Within 6 months, doubled throughput.','short');
op('After {event},','situation',1,'After the migration, cut costs by 30%.','medium');
op('When {trigger},','situation',1,'When traffic spiked, scaled the cluster cleanly.','medium');
op('During {period},','time',1,'During the 2024 rollout, trained 14 field agents.','medium');
op('Across {n} {unit},','situation',1,'Across 5 markets, standardised onboarding.','medium');
op('Following {event},','situation',1,'Following the audit, closed 12 findings.','medium');
op('Working with {team},','context',1,'Working with engineering, reduced latency by 40%.','long');
op('Partnering with {team},','context',1,'Partnering with finance, automated reconciliation.','long');
op('Leading {team},','context',1,'Leading a 6-person squad, delivered the rewrite.','long');
op('On behalf of {team},','context',1,'On behalf of ops, negotiated SLAs with vendors.','long');

// ── Context connectors ───────────────────────────────────────────────────────
function cc(connector, type, example) {
    expansion.cv_context_connectors.push({ connector, type, example });
}
cc('with a {n}-person team','team','with a 4-person team');
cc('alongside {team}','team','alongside the design team');
cc('reporting to {role}','team','reporting to the CTO');
cc('serving {n} {unit}','scope','serving 12k farmers');
cc('covering {n} {unit}','scope','covering 4 regions');
cc('spanning {n} {unit}','scope','spanning 6 product lines');
cc('over {n} {unit}','time','over 9 months');
cc('within a {budget} budget','condition','within a $40k budget');
cc('under a {sla} SLA','condition','under a 99.9% SLA');
cc('on a {tech} stack','condition','on a Postgres + Go stack');
cc('using {method}','condition','using a phased rollout');
cc('through {channel}','condition','through partner co-ops');

// ── Result connectors ────────────────────────────────────────────────────────
function rc(connector, type, example, score) {
    expansion.cv_result_connectors.push({ connector, type, example, human_score: score });
}
rc('lifting {x} from {a} to {b}','metric','lifting MAU from 8k to 21k',10);
rc('shaving {x} off {y}','metric','shaving 90 minutes off the close cycle',9);
rc('clearing the {goal} 6 weeks early','metric','clearing the Q3 goal 6 weeks early',9);
rc('saving roughly {x} per {period}','metric','saving roughly $4k per month',9);
rc('with zero downtime','qualitative','with zero downtime',9);
rc('without adding headcount','qualitative','without adding headcount',9);
rc('— a first for the team','qualitative','— a first for the team',9);
rc('— the largest in company history','qualitative','— the largest in company history',8);
rc('and held that gain for {n} quarters','qualitative','and held that gain for 4 quarters',9);
rc('beating the {team} benchmark by {x}%','metric','beating the EMEA benchmark by 18%',9);
rc('on roughly {x} of the addressable base','approximate','on roughly two-thirds of the addressable base',8);
rc('— effectively retiring {legacy}','qualitative','— effectively retiring the 2018 platform',9);

// ── Sentence structures ──────────────────────────────────────────────────────
function ss(label, pattern, lo, hi, ex, freq, section='bullet') {
    expansion.cv_sentence_structures.push({
        pattern_label: label, pattern, word_count_min: lo, word_count_max: hi,
        example: ex, use_frequency: freq, section
    });
}
ss('short','VERB + OBJECT',5,10,'Shipped the payments API.','common');
ss('short','VERB + OBJECT + NUMBER',6,11,'Trained 14 field agents.','common');
ss('medium','VERB + OBJECT + RESULT',12,18,'Cut report turnaround from 4 days to 6 hours.','common');
ss('medium','OPENER + VERB + OBJECT',12,20,'Within 90 days, retired the legacy ETL.','common');
ss('long','OPENER + VERB + OBJECT + CONTEXT + RESULT',20,30,'After the merger, consolidated 3 CRMs into one, cutting licence spend by $120k/yr.','occasional');
ss('long','VERB + OBJECT + CONTEXT + RESULT + QUALIFIER',20,30,'Rebuilt the onboarding flow with the design team, lifting activation from 41% to 67% in two quarters.','occasional');
ss('personality','SHORT EM-DASH AFTERTHOUGHT',6,12,'Closed it in two weeks — a record for the team.','rare');
ss('personality','PARENTHETICAL DETAIL',8,16,'Migrated 14 services to k8s (no rollback needed).','rare');

// ── Rhythm patterns ──────────────────────────────────────────────────────────
function r(name, seq, section, count, desc, score) {
    expansion.cv_rhythm_patterns.push({
        pattern_name: name, sequence: seq, section, bullet_count: count,
        description: desc, human_score: score
    });
}
r('punchy_lead', ['short','short','medium','long','personality'], 'current_role', 5, 'Hook fast, then expand.', 9);
r('story_arc', ['medium','long','short','long','personality'], 'current_role', 5, 'Narrative pull for senior roles.', 9);
r('metric_heavy', ['medium','medium','long','short','long','personality'], 'current_role', 6, 'Numbers in every other line.', 8);
r('quiet_competence', ['short','medium','short','medium','short'], 'current_role', 5, 'Calm, no-fanfare voice.', 8);
r('past_role_classic', ['medium','long','short','medium'], 'past_role', 4, 'Default for prior roles.', 9);
r('internship_brief', ['short','medium','short'], 'internship', 3, 'Compact, learning-oriented.', 9);
r('summary_three_beats', ['medium','long','short'], 'summary', 3, 'Three-beat summary opener.', 9);

// ── New field profiles (grow coverage) ───────────────────────────────────────
function fp(field, style, preferred, avoided, metrics, keywords) {
    expansion.cv_field_profiles.push({
        field, language_style: style, preferred_verbs: preferred,
        avoided_verbs: avoided, metric_types: metrics, jd_keywords: keywords
    });
}
fp('healthcare_clinical','humanistic',
    ['Treated','Diagnosed','Triaged','Counselled','Coordinated','Documented','Monitored'],
    ['Spearheaded','Disrupted','Pivoted'],
    ['patients','outcomes','wait times','readmission rate','satisfaction'],
    ['patient','clinical','triage','EMR','HIPAA','protocol','care','nurse','physician']);
fp('education_teaching','humanistic',
    ['Taught','Designed','Mentored','Assessed','Facilitated','Coached','Differentiated'],
    ['Spearheaded','Disrupted','Pivoted','Liaised'],
    ['student outcomes','pass rate','attendance','engagement','grade improvement'],
    ['curriculum','student','pedagogy','assessment','classroom','learning','syllabus','grade']);
fp('legal_compliance','technical',
    ['Drafted','Reviewed','Negotiated','Filed','Audited','Advised','Litigated'],
    ['Hacked','Disrupted','Spearheaded'],
    ['cases closed','contracts reviewed','compliance rate','risk reduction'],
    ['contract','compliance','regulatory','GDPR','litigation','counsel','statute','clause']);
fp('sales_commercial','commercial',
    ['Closed','Sold','Prospected','Negotiated','Quoted','Renewed','Upsold','Hunted','Farmed'],
    ['Liaised','Coordinated'],
    ['ARR','quota %','win rate','pipeline','deal size','retention'],
    ['quota','pipeline','prospect','close','SaaS','B2B','account','territory','deal']);
fp('product_management','technical',
    ['Shipped','Defined','Prioritised','Launched','Validated','Discovered','Roadmapped','Sunset'],
    ['Liaised','Spearheaded'],
    ['adoption','retention','NPS','activation','revenue','users'],
    ['product','roadmap','user','PRD','OKR','launch','feature','backlog','sprint','PM']);
fp('design_ux','creative',
    ['Designed','Prototyped','Wireframed','Researched','Tested','Shipped','Iterated'],
    ['Liaised','Coordinated'],
    ['conversion','task success','SUS score','time on task','engagement'],
    ['UX','UI','Figma','prototype','user research','wireframe','design system','accessibility']);
fp('hr_people','humanistic',
    ['Recruited','Onboarded','Coached','Trained','Promoted','Resolved','Mediated'],
    ['Hacked','Disrupted'],
    ['retention','time-to-hire','engagement score','headcount','offer accept rate'],
    ['HR','people','recruiting','onboarding','culture','engagement','L&D','talent']);
fp('operations_supply','technical',
    ['Optimised','Scheduled','Reduced','Standardised','Automated','Audited','Tracked'],
    ['Spearheaded','Hacked'],
    ['cycle time','OTIF','cost per unit','utilisation','defect rate','throughput'],
    ['operations','supply chain','logistics','warehouse','procurement','SLA','vendor','OTIF']);
fp('data_analytics','analytical',
    ['Modelled','Queried','Dashboarded','Forecasted','Cleaned','Joined','Pipelined'],
    ['Liaised','Spearheaded'],
    ['accuracy','MAPE','model lift','queries/day','dataset size','runtime'],
    ['SQL','Python','dbt','Airflow','BI','dashboard','warehouse','ETL','analytics','data']);

// ── New voice profiles ───────────────────────────────────────────────────────
function vp(name, tone, desc, verbosity, metric, opener, risk, formality, fields, sen, incompat, verbBias, structBias) {
    expansion.cv_voice_profiles.push({
        name, tone, description: desc, verbosity_level: verbosity, metric_preference: metric,
        opener_frequency: opener, risk_tolerance: risk, formality,
        compatible_fields: fields, compatible_seniority: sen, incompatible_with: incompat,
        verb_bias: verbBias, structure_bias: structBias
    });
}
vp('storyteller_executive','warm, narrative',
    'Reads like an article — context, conflict, result.', 4, 'medium', 0.45, 'bold', 'neutral',
    ['communications_marketing','product_management','sales_commercial','education_teaching'],
    ['senior','lead'], ['quiet_professional'],
    ['rebuilt','reframed','launched','scaled','convinced','closed'],
    ['medium','long']);
vp('numbers_first','crisp, evidence-led',
    'Almost every bullet starts with or pivots on a number.', 3, 'high', 0.2, 'safe', 'formal',
    ['finance','data_analytics','operations_supply','sales_commercial'],
    ['mid','senior','lead'], ['storyteller_executive'],
    ['cut','grew','doubled','tripled','saved','closed','raised'],
    ['short','medium']);
vp('craftsperson','careful, considered',
    'Quiet pride in the work; specific tools and choices.', 3, 'medium', 0.3, 'safe', 'neutral',
    ['design_ux','tech_software','creative','engineering_civil'],
    ['junior','mid','senior'], [],
    ['designed','crafted','shipped','tuned','refactored'],
    ['medium','long']);
vp('public_servant','measured, civic',
    'Plain, accountable language for public-sector work.', 3, 'medium', 0.25, 'safe', 'formal',
    ['government_public','ngo_development','healthcare_clinical','legal_compliance'],
    ['mid','senior','lead'], ['storyteller_executive'],
    ['delivered','coordinated','administered','reported','published'],
    ['short','medium']);
vp('field_practitioner','grounded, on-the-ground',
    'Specific places, named programmes, real units.', 2, 'medium', 0.2, 'safe', 'neutral',
    ['agri_irrigation','engineering_civil','ngo_development','operations_supply','healthcare_clinical'],
    ['entry','junior','mid','senior'], ['storyteller_executive'],
    ['mapped','installed','trained','delivered','ran','monitored'],
    ['short','medium']);

// Field/seniority defaults — extra combos
function combo(seniority, field, voice) {
    expansion.cv_seniority_field_combos.push({ seniority, field, notes: `default voice: ${voice}` });
}
combo('mid','sales_commercial','numbers_first');
combo('senior','sales_commercial','numbers_first');
combo('mid','product_management','craftsperson');
combo('senior','product_management','storyteller_executive');
combo('mid','design_ux','craftsperson');
combo('mid','data_analytics','numbers_first');
combo('senior','data_analytics','numbers_first');
combo('mid','healthcare_clinical','public_servant');
combo('mid','education_teaching','public_servant');
combo('mid','legal_compliance','public_servant');
combo('mid','operations_supply','field_practitioner');
combo('senior','operations_supply','numbers_first');
combo('mid','hr_people','public_servant');

const out = path.join(__dirname, '..', 'seeds', 'seeds-expansion.json');
fs.writeFileSync(out, JSON.stringify(expansion, null, 2));
const counts = Object.fromEntries(Object.entries(expansion).map(([k,v])=>[k, v.length]));
console.log('Wrote', out);
console.log(counts);
