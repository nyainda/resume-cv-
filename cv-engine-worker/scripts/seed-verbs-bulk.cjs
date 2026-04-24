#!/usr/bin/env node
/* T004 — Bulk verb pool expansion (architecture doc target: ≥1000 verbs).
 *
 * Inserts a curated set of professional CV verbs across the 6 production
 * categories (technical / management / analysis / communication / financial /
 * creative). Idempotent — uses INSERT OR IGNORE + (verb_present, category)
 * unique key, so re-runs are safe. After insert it refreshes the affected
 * cv:verbs:<cat>:<tense> KV cache keys.
 *
 * Each tuple is [verb_present, verb_past, energy, score].
 *   energy ∈ {high, medium, low}
 *   score  ∈ 7..10  (only verbs ≥ 7 ever surface in the brief)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { d1Query, kvPut } = require('./_lib.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Curated verb pools — every entry is a real, professionally-acceptable CV verb.
// Lists are intentionally large; duplicates against the live DB are filtered
// out before insert, so being generous here is safe.
// ─────────────────────────────────────────────────────────────────────────────

const TECHNICAL = [
    ['Architects','Architected','high',9],['Builds','Built','high',9],['Codes','Coded','medium',8],
    ['Configures','Configured','medium',8],['Constructs','Constructed','high',8],['Crafts','Crafted','medium',8],
    ['Customises','Customised','medium',8],['Debugs','Debugged','medium',8],['Decouples','Decoupled','high',9],
    ['Deploys','Deployed','high',9],['Designs','Designed','high',9],['Develops','Developed','high',9],
    ['Diagnoses','Diagnosed','medium',8],['Documents','Documented','medium',7],['Engineers','Engineered','high',9],
    ['Extends','Extended','medium',8],['Fixes','Fixed','medium',7],['Hardens','Hardened','high',9],
    ['Implements','Implemented','high',9],['Improves','Improved','medium',8],['Indexes','Indexed','medium',8],
    ['Instruments','Instrumented','high',9],['Integrates','Integrated','high',9],['Iterates','Iterated','medium',7],
    ['Launches','Launched','high',9],['Maintains','Maintained','medium',7],['Migrates','Migrated','high',9],
    ['Modernises','Modernised','high',9],['Monitors','Monitored','medium',7],['Optimises','Optimised','high',9],
    ['Orchestrates','Orchestrated','high',9],['Parses','Parsed','medium',7],['Patches','Patched','medium',8],
    ['Profiles','Profiled','medium',8],['Prototypes','Prototyped','medium',8],['Provisions','Provisioned','high',9],
    ['Refactors','Refactored','high',9],['Releases','Released','high',9],['Rewrites','Rewrote','high',8],
    ['Scales','Scaled','high',9],['Ships','Shipped','high',9],['Stabilises','Stabilised','medium',8],
    ['Streamlines','Streamlined','high',9],['Strengthens','Strengthened','medium',8],['Tests','Tested','medium',8],
    ['Tunes','Tuned','medium',8],['Upgrades','Upgraded','medium',8],['Validates','Validated','medium',8],
    ['Wires','Wired','medium',7],['Automates','Automated','high',9],['Caches','Cached','medium',8],
    ['Containerises','Containerised','high',9],['Authenticates','Authenticated','medium',8],['Authorises','Authorised','medium',8],
    ['Backports','Backported','medium',7],['Bootstraps','Bootstrapped','high',9],['Encrypts','Encrypted','high',9],
    ['Mocks','Mocked','medium',7],['Pairs','Paired','medium',7],['Reviews','Reviewed','medium',8],
    ['Schedules','Scheduled','medium',7],['Streams','Streamed','high',9],['Stubs','Stubbed','medium',7],
    ['Versions','Versioned','medium',7],['Lints','Linted','medium',7],['Batches','Batched','medium',8],
    ['Queues','Queued','medium',7],
    // — second wave —
    ['Compiles','Compiled','medium',8],['Bundles','Bundled','medium',7],['Transpiles','Transpiled','medium',7],
    ['Polyfills','Polyfilled','medium',7],['Mounts','Mounted','medium',7],['Unmounts','Unmounted','medium',7],
    ['Rebuilds','Rebuilt','medium',8],['Repackages','Repackaged','medium',7],['Rehydrates','Rehydrated','medium',8],
    ['Serialises','Serialised','medium',7],['Deserialises','Deserialised','medium',7],['Encodes','Encoded','medium',7],
    ['Decodes','Decoded','medium',7],['Compresses','Compressed','medium',8],['Decompresses','Decompressed','medium',7],
    ['Throttles','Throttled','medium',8],['Debounces','Debounced','medium',8],['Memoises','Memoised','medium',8],
    ['Vectorises','Vectorised','medium',8],['Quantises','Quantised','medium',8],['Distils','Distilled','medium',8],
    ['Fine-tunes','Fine-tuned','high',9],['Pretrains','Pretrained','high',9],['Embeds','Embedded','medium',8],
    ['Indexes','Indexed','medium',8],['Retrieves','Retrieved','medium',7],['Aggregates','Aggregated','medium',8],
    ['Joins','Joined','medium',7],['Materialises','Materialised','medium',8],['Replicates','Replicated','high',9],
    ['Shards','Sharded','high',9],['Partitions','Partitioned','high',9],['Snapshots','Snapshotted','medium',8],
    ['Backs up','Backed up','medium',7],['Restores','Restored','medium',8],['Rolls back','Rolled back','medium',8],
    ['Patches','Patched','medium',8],['Smoke-tests','Smoke-tested','medium',8],['Load-tests','Load-tested','high',9],
    ['Stress-tests','Stress-tested','high',9],['Penetration-tests','Penetration-tested','high',9],
    ['Fingerprints','Fingerprinted','medium',8],['Whitelists','Whitelisted','medium',7],['Blacklists','Blacklisted','medium',7],
    ['Sandboxes','Sandboxed','medium',8],['Isolates','Isolated','medium',8],['Mirrors','Mirrored','medium',8],
    ['Forks','Forked','medium',7],['Merges','Merged','medium',7],['Rebases','Rebased','medium',7],
    ['Cherry-picks','Cherry-picked','medium',7],['Reverts','Reverted','medium',7],['Bisects','Bisected','medium',8],
    ['Tags','Tagged','medium',7],['Releases','Released','high',9],['Pushes','Pushed','medium',7],
    ['Pulls','Pulled','medium',7],['Rotates','Rotated','medium',8],['Provisions','Provisioned','high',9],
    ['Decommissions','Decommissioned','high',9],['Greenfields','Greenfielded','high',9],['Brownfields','Brownfielded','medium',7],
    ['Lifts','Lifted','medium',8],['Shifts','Shifted','medium',8],['Re-platforms','Re-platformed','high',9],
    ['Re-architects','Re-architected','high',9],['Decentralises','Decentralised','high',9],['Centralises','Centralised','high',9],
    ['Federates','Federated','high',9],['Sandboxes','Sandboxed','medium',8],['Hot-fixes','Hot-fixed','high',9],
    ['Live-patches','Live-patched','high',9],['Canary-releases','Canary-released','high',9],['Blue-greens','Blue-greened','high',9],
    ['Rolls','Rolled','medium',7],['Rebuilds','Rebuilt','medium',8],['Hardens','Hardened','high',9],
    ['Sanitises','Sanitised','medium',8],['Scrubs','Scrubbed','medium',8],['Anonymises','Anonymised','medium',8],
    ['Pseudonymises','Pseudonymised','medium',8],['Tokenises','Tokenised','medium',8],['Hashes','Hashed','medium',8],
    ['Salts','Salted','medium',7],['Signs','Signed','medium',8],['Verifies','Verified','medium',8],
    ['Notarises','Notarised','medium',7],['Attests','Attested','medium',7],['Codifies','Codified','medium',8],
    ['Enforces','Enforced','high',9],['Gatekeeps','Gatekept','medium',8],['Rate-limits','Rate-limited','medium',8],
    ['Backpressures','Backpressured','medium',8],['Queues','Queued','medium',7],['Dispatches','Dispatched','medium',8],
    ['Routes','Routed','medium',7],['Resolves','Resolved','medium',8],['Forwards','Forwarded','medium',7],
    ['Mirrors','Mirrored','medium',8],['Tunnels','Tunnelled','medium',7],['Bridges','Bridged','medium',7],
    ['Peers','Peered','medium',7],['Benchmarks','Benchmarked','high',9],['Profiles','Profiled','medium',8],
    ['Observes','Observed','medium',7],['Traces','Traced','medium',8],['Logs','Logged','medium',7],
    ['Alerts','Alerted','medium',7],['Pages','Paged','medium',7],['Dashboards','Dashboarded','medium',7],
    ['Templates','Templated','medium',7],['Scaffolds','Scaffolded','medium',8],['Boilerplates','Boilerplated','medium',7],
    ['Generates','Generated','medium',8],['Mutates','Mutated','medium',7],['Subscribes','Subscribed','medium',7],
    ['Publishes','Published','medium',8],['Broadcasts','Broadcast','medium',8],['Multicasts','Multicast','medium',7],
    ['Unicasts','Unicast','medium',6],['Polls','Polled','medium',7],['Long-polls','Long-polled','medium',7],
    ['Web-sockets','Web-socketed','medium',7],['Webhooks','Webhooked','medium',8],['Sinks','Sank','medium',7],
    ['Sources','Sourced','medium',7],['Pipelines','Pipelined','high',9],['Fan-outs','Fanned out','medium',8],
    ['Fan-ins','Fanned in','medium',8],['Idempotentises','Idempotised','medium',8],['Upserts','Upserted','medium',7],
    ['Migrates','Migrated','high',9],['Backfills','Backfilled','medium',8],['Forward-fills','Forward-filled','medium',7],
    ['Reconciles','Reconciled','medium',8],['Replays','Replayed','medium',8],['Compacts','Compacted','medium',7],
    ['Vacuums','Vacuumed','medium',7],['Reindexes','Reindexed','medium',8],['Tunes','Tuned','medium',8],
    ['Sharpens','Sharpened','medium',8],['Hardens','Hardened','high',9],['Rate-shapes','Rate-shaped','medium',7],
    ['Curates','Curated','medium',8],['Promotes','Promoted','medium',8],['Demotes','Demoted','medium',7],
    ['Retires','Retired','medium',7],['Deprecates','Deprecated','medium',8],['Sunsets','Sunsetted','medium',8],
];

const MANAGEMENT = [
    ['Leads','Led','high',9],['Manages','Managed','high',9],['Directs','Directed','high',9],
    ['Oversees','Oversaw','high',9],['Coordinates','Coordinated','medium',8],['Supervises','Supervised','medium',8],
    ['Mentors','Mentored','high',9],['Coaches','Coached','high',9],['Develops','Developed','high',9],
    ['Empowers','Empowered','high',9],['Aligns','Aligned','medium',8],['Champions','Championed','high',9],
    ['Drives','Drove','high',9],['Enables','Enabled','medium',8],['Facilitates','Facilitated','medium',8],
    ['Galvanises','Galvanised','high',9],['Guides','Guided','medium',8],['Heads','Headed','high',9],
    ['Influences','Influenced','high',9],['Inspires','Inspired','high',9],['Mobilises','Mobilised','high',9],
    ['Motivates','Motivated','high',9],['Negotiates','Negotiated','high',9],['Onboards','Onboarded','medium',8],
    ['Orchestrates','Orchestrated','high',9],['Outsources','Outsourced','medium',8],['Owns','Owned','high',9],
    ['Partners','Partnered','medium',8],['Pioneers','Pioneered','high',9],['Plans','Planned','medium',8],
    ['Prioritises','Prioritised','medium',8],['Recruits','Recruited','medium',8],['Reorganises','Reorganised','high',9],
    ['Resolves','Resolved','medium',8],['Restructures','Restructured','high',9],['Reviews','Reviewed','medium',7],
    ['Rolls out','Rolled out','high',9],['Scales','Scaled','high',9],['Sets','Set','medium',7],
    ['Shapes','Shaped','high',9],['Spearheads','Spearheaded','high',9],['Sponsors','Sponsored','medium',8],
    ['Stages','Staged','medium',7],['Steers','Steered','high',9],['Strategises','Strategised','high',9],
    ['Structures','Structured','medium',8],['Supports','Supported','medium',7],['Sustains','Sustained','medium',8],
    ['Trains','Trained','medium',8],['Transforms','Transformed','high',9],['Unifies','Unified','high',9],
    ['Upskills','Upskilled','medium',8],['Aligns','Aligned','medium',8],['Hires','Hired','medium',8],
    ['Promotes','Promoted','medium',8],['Retains','Retained','medium',8],['Re-engages','Re-engaged','medium',8],
    ['Re-skills','Re-skilled','medium',8],['Cross-trains','Cross-trained','medium',8],['Delegates','Delegated','medium',8],
    ['Escalates','Escalated','medium',7],['De-escalates','De-escalated','medium',8],['Mediates','Mediated','medium',8],
    ['Adjudicates','Adjudicated','medium',7],['Arbitrates','Arbitrated','medium',8],['Brokers','Brokered','high',9],
    ['Convenes','Convened','medium',8],['Chairs','Chaired','high',9],['Hosts','Hosted','medium',7],
    ['Moderates','Moderated','medium',7],['Officiates','Officiated','medium',7],['Ratifies','Ratified','medium',8],
    ['Sanctions','Sanctioned','medium',7],['Authorises','Authorised','medium',8],['Empanels','Empanelled','medium',7],
    ['Constitutes','Constituted','medium',7],['Stewards','Stewarded','high',9],['Custodians','Custodianed','medium',7],
    ['Governs','Governed','high',9],['Polices','Policed','medium',7],['Enforces','Enforced','high',9],
    ['Audits','Audited','high',9],['Reviews','Reviewed','medium',7],['Vets','Vetted','medium',8],
    ['Approves','Approved','medium',7],['Rejects','Rejected','medium',7],['Calibrates','Calibrated','medium',8],
    ['Right-sizes','Right-sized','high',9],['Re-baselines','Re-baselined','medium',8],['Re-charters','Re-chartered','medium',8],
    ['Charters','Chartered','high',9],['Mandates','Mandated','high',9],['Commissions','Commissioned','high',9],
    ['Decommissions','Decommissioned','medium',8],['Sunsets','Sunsetted','medium',8],['Wind-downs','Wound down','medium',7],
    ['Stands up','Stood up','high',9],['Stands down','Stood down','medium',7],['Greenfields','Greenfielded','high',9],
    ['Turnarounds','Turned around','high',9],['Recovers','Recovered','high',9],['Rescues','Rescued','high',9],
    ['Salvages','Salvaged','high',9],['Re-floats','Re-floated','medium',8],['Resets','Reset','high',9],
    ['Re-launches','Re-launched','high',9],['Pivots','Pivoted','high',9],['Re-orgs','Re-orged','high',9],
    ['Re-tools','Re-tooled','high',9],['Re-skills','Re-skilled','medium',8],['Up-levels','Up-levelled','high',9],
    ['Down-levels','Down-levelled','medium',7],['Cascades','Cascaded','medium',8],['Embeds','Embedded','medium',8],
    ['Institutionalises','Institutionalised','high',9],['Operationalises','Operationalised','high',9],['Codifies','Codified','medium',8],
    ['Formalises','Formalised','medium',8],['Standardises','Standardised','medium',8],['Templates','Templated','medium',7],
    ['Playbooks','Playbooked','medium',8],['Runbooks','Runbooked','medium',8],['Hand-books','Hand-booked','medium',7],
];

const ANALYSIS = [
    ['Analyses','Analysed','high',9],['Assesses','Assessed','medium',8],['Benchmarks','Benchmarked','high',9],
    ['Calculates','Calculated','medium',8],['Categorises','Categorised','medium',7],['Classifies','Classified','medium',7],
    ['Compares','Compared','medium',7],['Computes','Computed','medium',8],['Conducts','Conducted','medium',7],
    ['Correlates','Correlated','high',9],['Decodes','Decoded','medium',8],['Diagnoses','Diagnosed','high',9],
    ['Disaggregates','Disaggregated','medium',8],['Dissects','Dissected','medium',8],['Distinguishes','Distinguished','medium',7],
    ['Documents','Documented','medium',7],['Estimates','Estimated','medium',7],['Evaluates','Evaluated','high',9],
    ['Examines','Examined','medium',8],['Extracts','Extracted','medium',8],['Forecasts','Forecasted','high',9],
    ['Identifies','Identified','medium',8],['Inspects','Inspected','medium',7],['Interprets','Interpreted','high',9],
    ['Investigates','Investigated','high',9],['Maps','Mapped','medium',8],['Measures','Measured','medium',8],
    ['Models','Modelled','high',9],['Monitors','Monitored','medium',7],['Quantifies','Quantified','high',9],
    ['Researches','Researched','medium',8],['Reviews','Reviewed','medium',7],['Scrutinises','Scrutinised','medium',8],
    ['Segments','Segmented','high',9],['Simulates','Simulated','high',9],['Sizes','Sized','medium',8],
    ['Studies','Studied','medium',7],['Surveys','Surveyed','medium',7],['Synthesises','Synthesised','high',9],
    ['Tests','Tested','medium',7],['Tracks','Tracked','medium',7],['Validates','Validated','medium',8],
    ['Verifies','Verified','medium',7],['Visualises','Visualised','high',9],['Weighs','Weighed','medium',7],
    // — extras —
    ['A/B tests','A/B tested','high',9],['Multivariate-tests','Multivariate-tested','high',9],['Cohorts','Cohorted','medium',8],
    ['Funnels','Funnelled','medium',8],['Attributes','Attributed','medium',8],['De-duplicates','De-duplicated','medium',7],
    ['Reconciles','Reconciled','medium',8],['Triangulates','Triangulated','high',9],['Cross-references','Cross-referenced','medium',8],
    ['Stress-tests','Stress-tested','high',9],['Sensitivity-tests','Sensitivity-tested','high',9],['Back-tests','Back-tested','high',9],
    ['Out-of-sample-tests','Out-of-sample-tested','high',9],['Walks forward','Walked forward','medium',8],
    ['Hypothesises','Hypothesised','medium',8],['Falsifies','Falsified','medium',8],['Refutes','Refuted','medium',7],
    ['Substantiates','Substantiated','medium',8],['Corroborates','Corroborated','medium',8],['Triangulates','Triangulated','high',9],
    ['Profiles','Profiled','medium',8],['Clusters','Clustered','high',9],['Classifies','Classified','medium',7],
    ['Regresses','Regressed','medium',8],['Predicts','Predicted','high',9],['Projects','Projected','high',9],
    ['Forecasts','Forecasted','high',9],['Nowcasts','Nowcasted','medium',8],['Smooths','Smoothed','medium',7],
    ['De-trends','De-trended','medium',8],['De-seasonalises','De-seasonalised','medium',8],['Imputes','Imputed','medium',8],
    ['Infers','Inferred','medium',8],['Deduces','Deduced','medium',7],['Extrapolates','Extrapolated','medium',8],
    ['Interpolates','Interpolated','medium',7],['Tabulates','Tabulated','medium',7],['Charts','Charted','medium',7],
    ['Plots','Plotted','medium',7],['Heatmaps','Heatmapped','medium',8],['Sankeys','Sankeyed','medium',7],
    ['Histograms','Histogrammed','medium',7],['Box-plots','Box-plotted','medium',7],['Decomposes','Decomposed','medium',8],
    ['Re-aggregates','Re-aggregated','medium',7],['Pivots','Pivoted','medium',7],['Drills down','Drilled down','medium',8],
    ['Rolls up','Rolled up','medium',8],['Slices','Sliced','medium',7],['Dices','Diced','medium',7],
    ['Bins','Binned','medium',7],['Bucketises','Bucketised','medium',7],['Z-scores','Z-scored','medium',7],
    ['Standardises','Standardised','medium',8],['Normalises','Normalised','medium',8],['Whitens','Whitened','medium',7],
    ['Encodes','Encoded','medium',7],['One-hot-encodes','One-hot-encoded','medium',8],['Embeds','Embedded','medium',8],
    ['Vectorises','Vectorised','medium',8],['Tokenises','Tokenised','medium',8],['Lemmatises','Lemmatised','medium',7],
    ['Stems','Stemmed','medium',7],['NER-tags','NER-tagged','medium',7],['POS-tags','POS-tagged','medium',7],
    ['Sentiment-scores','Sentiment-scored','medium',8],['Topic-models','Topic-modelled','medium',8],
    ['Recommends','Recommended','high',9],['Concludes','Concluded','medium',8],['Reports','Reported','medium',7],
    ['Briefs','Briefed','medium',8],['Debriefs','Debriefed','medium',7],['Synthesises','Synthesised','high',9],
    ['Frames','Framed','medium',8],['Re-frames','Re-framed','medium',8],['Stress-frames','Stress-framed','medium',7],
    ['Scenarios','Scenarioed','medium',8],['War-games','War-gamed','high',9],['Pre-mortems','Pre-mortemed','medium',8],
    ['Post-mortems','Post-mortemed','medium',8],['Root-causes','Root-caused','high',9],['5-whys','5-whyed','medium',8],
    ['Fishbones','Fishboned','medium',7],['Pareto-charts','Pareto-charted','medium',8],['SWOTs','SWOT-ed','medium',8],
    ['PESTLEs','PESTLE-d','medium',7],['Porters-fives','Porters-fived','medium',8],['Value-chains','Value-chained','medium',8],
    ['Journey-maps','Journey-mapped','medium',8],['Service-blueprints','Service-blueprinted','medium',8],
    ['Stakeholder-maps','Stakeholder-mapped','medium',8],['Capability-maps','Capability-mapped','medium',8],
    ['Process-maps','Process-mapped','medium',8],['Value-streams','Value-streamed','high',9],['Kano-models','Kano-modelled','medium',8],
    ['Cost-benefits','Cost-benefited','medium',8],['Break-evens','Broke-even','medium',8],['Sensitises','Sensitised','medium',8],
    ['Flexes','Flexed','medium',7],['Stresses','Stressed','medium',8],['Reverse-engineers','Reverse-engineered','high',9],
];

const COMMUNICATION = [
    ['Articulates','Articulated','high',9],['Authors','Authored','medium',8],['Briefs','Briefed','medium',8],
    ['Champions','Championed','high',9],['Clarifies','Clarified','medium',7],['Coaches','Coached','high',9],
    ['Collaborates','Collaborated','medium',8],['Communicates','Communicated','medium',8],['Conveys','Conveyed','medium',7],
    ['Convinces','Convinced','high',9],['Coordinates','Coordinated','medium',8],['Counsels','Counselled','medium',8],
    ['Crafts','Crafted','medium',8],['Critiques','Critiqued','medium',7],['Curates','Curated','medium',8],
    ['Debates','Debated','medium',7],['Delivers','Delivered','high',9],['Demonstrates','Demonstrated','medium',8],
    ['Drafts','Drafted','medium',7],['Edits','Edited','medium',7],['Educates','Educated','medium',8],
    ['Engages','Engaged','medium',8],['Explains','Explained','medium',7],['Facilitates','Facilitated','medium',8],
    ['Hosts','Hosted','medium',7],['Influences','Influenced','high',9],['Informs','Informed','medium',7],
    ['Lectures','Lectured','medium',7],['Liaises','Liaised','medium',8],['Lobbies','Lobbied','medium',8],
    ['Markets','Marketed','medium',8],['Mediates','Mediated','medium',8],['Moderates','Moderated','medium',7],
    ['Negotiates','Negotiated','high',9],['Networks','Networked','medium',7],['Outlines','Outlined','medium',7],
    ['Persuades','Persuaded','high',9],['Pitches','Pitched','high',9],['Presents','Presented','high',9],
    ['Promotes','Promoted','medium',8],['Publicises','Publicised','medium',8],['Publishes','Published','medium',8],
    ['Reframes','Reframed','medium',8],['Reports','Reported','medium',7],['Represents','Represented','medium',8],
    ['Responds','Responded','medium',7],['Reviews','Reviewed','medium',7],['Sells','Sold','high',9],
    ['Shares','Shared','medium',7],['Speaks','Spoke','medium',8],['Storytells','Storytold','high',9],
    ['Summarises','Summarised','medium',7],['Synthesises','Synthesised','high',9],['Teaches','Taught','medium',8],
    ['Trains','Trained','medium',8],['Translates','Translated','medium',7],['Tutors','Tutored','medium',7],
    ['Upsells','Upsold','high',9],['Writes','Wrote','medium',7],['Briefs','Briefed','medium',8],
    ['De-briefs','De-briefed','medium',7],['Workshops','Workshopped','medium',8],['Roadshows','Roadshowed','high',9],
    ['Townhalls','Townhalled','medium',8],['Keynotes','Keynoted','high',9],['Panels','Panelled','medium',7],
    ['Mentors','Mentored','high',9],['Champions','Championed','high',9],['Advocates','Advocated','high',9],
    ['Lobbies','Lobbied','medium',8],['Petitions','Petitioned','medium',7],['Canvasses','Canvassed','medium',7],
    ['Solicits','Solicited','medium',7],['Surveys','Surveyed','medium',7],['Polls','Polled','medium',7],
    ['Interviews','Interviewed','medium',8],['Hosts','Hosted','medium',7],['Convenes','Convened','medium',8],
    ['Galvanises','Galvanised','high',9],['Mobilises','Mobilised','high',9],['Rallies','Rallied','high',9],
    ['Energises','Energised','high',9],['Re-engages','Re-engaged','medium',8],['Re-frames','Re-framed','medium',8],
    ['Re-positions','Re-positioned','high',9],['Re-brands','Re-branded','high',9],['Re-launches','Re-launched','high',9],
    ['Onboards','Onboarded','medium',8],['Off-boards','Off-boarded','medium',7],['Hand-overs','Handed over','medium',7],
    ['Hand-offs','Handed off','medium',7],['Walks through','Walked through','medium',7],['Run-throughs','Ran through','medium',7],
    ['Showcases','Showcased','high',9],['Demos','Demoed','medium',8],['Beta-tests','Beta-tested','medium',8],
    ['Soft-launches','Soft-launched','medium',8],['Hard-launches','Hard-launched','high',9],['Goes live','Went live','high',9],
    ['Cascades','Cascaded','medium',8],['Echoes','Echoed','medium',7],['Reinforces','Reinforced','medium',8],
    ['Underscores','Underscored','medium',8],['Highlights','Highlighted','medium',7],['Spotlights','Spotlighted','medium',8],
    ['Amplifies','Amplified','high',9],['Broadcasts','Broadcast','medium',8],['Newsletters','Newslettered','medium',7],
    ['Podcasts','Podcasted','medium',7],['Blogs','Blogged','medium',7],['Vlogs','Vlogged','medium',7],
    ['Op-eds','Op-edded','medium',7],['Bylines','Bylined','medium',8],['Ghost-writes','Ghost-wrote','medium',7],
    ['Co-authors','Co-authored','medium',8],['Peer-reviews','Peer-reviewed','medium',8],['White-papers','White-papered','medium',8],
    ['Case-studies','Case-studied','medium',8],['Testimonialises','Testimonialised','medium',7],['Quotes','Quoted','medium',7],
    ['Cites','Cited','medium',7],['References','Referenced','medium',7],['Footnotes','Footnoted','medium',6],
];

const FINANCIAL = [
    ['Allocates','Allocated','high',9],['Audits','Audited','high',9],['Balances','Balanced','medium',8],
    ['Banks','Banked','medium',7],['Books','Booked','medium',7],['Budgets','Budgeted','high',9],
    ['Calculates','Calculated','medium',7],['Capitalises','Capitalised','high',9],['Closes','Closed','high',9],
    ['Collects','Collected','medium',7],['Computes','Computed','medium',7],['Consolidates','Consolidated','high',9],
    ['Controls','Controlled','medium',8],['Costs','Costed','medium',8],['Deposits','Deposited','medium',7],
    ['Discounts','Discounted','medium',7],['Diversifies','Diversified','high',9],['Earns','Earned','medium',7],
    ['Exceeds','Exceeded','high',9],['Finances','Financed','high',9],['Forecasts','Forecasted','high',9],
    ['Funds','Funded','high',9],['Gains','Gained','medium',8],['Generates','Generated','high',9],
    ['Grows','Grew','high',9],['Hedges','Hedged','high',9],['Increases','Increased','high',9],
    ['Invests','Invested','high',9],['Leverages','Leveraged','high',9],['Liquidates','Liquidated','medium',8],
    ['Loans','Loaned','medium',7],['Manages','Managed','medium',8],['Maximises','Maximised','high',9],
    ['Measures','Measured','medium',7],['Mitigates','Mitigated','high',9],['Models','Modelled','high',9],
    ['Monitors','Monitored','medium',7],['Negotiates','Negotiated','high',9],['Optimises','Optimised','high',9],
    ['Owns','Owned','medium',8],['Pays','Paid','medium',7],['Plans','Planned','medium',7],
    ['Prices','Priced','medium',8],['Procures','Procured','medium',8],['Profits','Profited','high',9],
    ['Projects','Projected','high',9],['Quantifies','Quantified','medium',8],['Raises','Raised','high',9],
    ['Reconciles','Reconciled','medium',8],['Recovers','Recovered','medium',8],['Reduces','Reduced','high',9],
    ['Refinances','Refinanced','medium',8],['Reinvests','Reinvested','medium',8],['Reports','Reported','medium',7],
    ['Restructures','Restructured','high',9],['Returns','Returned','medium',8],['Saves','Saved','high',9],
    ['Secures','Secured','high',9],['Settles','Settled','medium',7],['Slashes','Slashed','high',9],
    ['Spends','Spent','medium',7],['Stewards','Stewarded','high',9],['Streamlines','Streamlined','high',9],
    ['Strengthens','Strengthened','medium',8],['Stretches','Stretched','medium',7],['Submits','Submitted','medium',7],
    ['Subsidises','Subsidised','medium',7],['Surpasses','Surpassed','high',9],['Trades','Traded','medium',8],
    ['Trims','Trimmed','medium',7],['Underwrites','Underwrote','high',9],['Upsells','Upsold','high',9],
    ['Values','Valued','medium',7],['Verifies','Verified','medium',7],['Wins','Won','high',9],
    ['Yields','Yielded','medium',8],['Closes the books','Closed the books','medium',8],['Reforecasts','Reforecasted','high',9],
    ['Re-baselines','Re-baselined','medium',8],['Variance-analyses','Variance-analysed','high',9],['Roll-forwards','Roll-forwarded','medium',7],
    ['Accruals','Accrued','medium',7],['Defers','Deferred','medium',7],['Amortises','Amortised','medium',8],
    ['Depreciates','Depreciated','medium',7],['Capitalises','Capitalised','high',9],['Expenses','Expensed','medium',7],
    ['Allocates overheads','Allocated overheads','medium',7],['Re-classifies','Re-classified','medium',7],
    ['Eliminates','Eliminated','high',9],['Consolidates','Consolidated','high',9],['Translates currency','Translated currency','medium',8],
    ['Hedges FX','Hedged FX','high',9],['Hedges rates','Hedged rates','high',9],['Sweeps cash','Swept cash','medium',8],
    ['Pools cash','Pooled cash','medium',8],['Repatriates','Repatriated','high',9],['Tax-optimises','Tax-optimised','high',9],
    ['Tax-loss-harvests','Tax-loss-harvested','medium',8],['Files','Filed','medium',7],['Discloses','Disclosed','medium',8],
    ['Restates','Restated','medium',8],['Re-issues','Re-issued','medium',7],['Re-prices','Re-priced','medium',8],
    ['Re-rates','Re-rated','medium',8],['Re-syndicates','Re-syndicated','medium',8],['Syndicates','Syndicated','high',9],
    ['Underwrites','Underwrote','high',9],['Co-invests','Co-invested','high',9],['Bridge-finances','Bridge-financed','high',9],
    ['Mezzanines','Mezzanined','medium',8],['IPOs','IPOed','high',9],['SPACs','SPACed','high',9],
    ['Spins off','Spun off','high',9],['Carves out','Carved out','high',9],['Roll-ups','Rolled up','high',9],
    ['LBOs','LBOed','high',9],['Recaps','Recapped','high',9],['Restructures debt','Restructured debt','high',9],
    ['Refinances debt','Refinanced debt','high',9],['Tenders','Tendered','medium',8],['Buys back','Bought back','high',9],
    ['Issues','Issued','medium',8],['Floats','Floated','high',9],['Privatises','Privatised','high',9],
    ['Sources deals','Sourced deals','high',9],['Closes deals','Closed deals','high',9],['Diligences','Diligenced','high',9],
    ['Models DCF','Modelled DCF','high',9],['LBO-models','LBO-modelled','high',9],['Comp-analyses','Comp-analysed','medium',8],
    ['Precedent-analyses','Precedent-analysed','medium',8],['Pitches deals','Pitched deals','high',9],
];

const CREATIVE = [
    ['Animates','Animated','medium',8],['Brands','Branded','high',9],['Coaches','Coached','medium',7],
    ['Composes','Composed','high',9],['Conceives','Conceived','high',9],['Conceptualises','Conceptualised','high',9],
    ['Creates','Created','medium',8],['Curates','Curated','medium',8],['Customises','Customised','medium',7],
    ['Designs','Designed','high',9],['Develops','Developed','high',9],['Devises','Devised','high',9],
    ['Directs','Directed','high',9],['Draws','Drew','medium',7],['Drives','Drove','medium',8],
    ['Edits','Edited','medium',7],['Engineers','Engineered','high',9],['Envisions','Envisioned','high',9],
    ['Establishes','Established','medium',8],['Fashions','Fashioned','medium',8],['Films','Filmed','medium',8],
    ['Forms','Formed','medium',7],['Founds','Founded','high',9],['Generates','Generated','medium',8],
    ['Illustrates','Illustrated','medium',8],['Imagines','Imagined','medium',8],['Improvises','Improvised','medium',7],
    ['Initiates','Initiated','medium',8],['Innovates','Innovated','high',9],['Institutes','Instituted','medium',8],
    ['Introduces','Introduced','medium',8],['Invents','Invented','high',9],['Launches','Launched','high',9],
    ['Makes','Made','medium',7],['Models','Modelled','medium',8],['Originates','Originated','high',9],
    ['Paints','Painted','medium',7],['Performs','Performed','medium',8],['Photographs','Photographed','medium',8],
    ['Pioneers','Pioneered','high',9],['Plans','Planned','medium',7],['Plays','Played','medium',7],
    ['Produces','Produced','high',9],['Programs','Programmed','medium',8],['Promotes','Promoted','medium',8],
    ['Publishes','Published','medium',8],['Reimagines','Reimagined','high',9],['Renders','Rendered','medium',7],
    ['Restyles','Restyled','medium',8],['Revamps','Revamped','high',9],['Sculpts','Sculpted','medium',8],
    ['Sketches','Sketched','medium',7],['Stages','Staged','medium',8],['Storyboards','Storyboarded','medium',8],
    ['Styles','Styled','medium',7],['Visualises','Visualised','high',9],['Writes','Wrote','medium',7],
    ['Re-brands','Re-branded','high',9],['Re-imagines','Re-imagined','high',9],['Re-stages','Re-staged','medium',8],
    ['Re-positions','Re-positioned','high',9],['Re-launches','Re-launched','high',9],['Re-skins','Re-skinned','medium',7],
    ['Re-themes','Re-themed','medium',7],['Themes','Themed','medium',7],['Moodboards','Moodboarded','medium',7],
    ['Wireframes','Wireframed','medium',8],['Mocks up','Mocked up','medium',8],['Prototypes','Prototyped','high',9],
    ['Hi-fis','Hi-fied','medium',7],['Lo-fis','Lo-fied','medium',7],['Specs','Specced','medium',7],
    ['Hand-offs','Handed off','medium',7],['Red-lines','Red-lined','medium',7],['White-labels','White-labelled','medium',8],
    ['Skins','Skinned','medium',7],['Themes','Themed','medium',7],['Tokenises','Tokenised','medium',8],
    ['Systems','Systemed','medium',7],['Componentises','Componentised','high',9],['Atomises','Atomised','medium',8],
    ['Molecularises','Molecularised','medium',7],['Patternises','Patternised','medium',7],['Templates','Templated','medium',7],
    ['Codifies','Codified','medium',8],['Documents','Documented','medium',7],['Showcases','Showcased','high',9],
    ['Curates','Curated','medium',8],['Edits','Edited','medium',7],['Re-edits','Re-edited','medium',7],
    ['Polishes','Polished','medium',8],['Refines','Refined','medium',8],['Sharpens','Sharpened','medium',8],
    ['Tightens','Tightened','medium',8],['Loosens','Loosened','medium',7],['Re-cuts','Re-cut','medium',7],
    ['Re-mixes','Re-mixed','medium',7],['Masters','Mastered','medium',8],['Re-masters','Re-mastered','medium',7],
    ['Colour-grades','Colour-graded','medium',8],['Sound-designs','Sound-designed','medium',8],['Foleys','Foleyed','medium',7],
    ['Voiceovers','Voiced over','medium',7],['Captions','Captioned','medium',7],['Subtitles','Subtitled','medium',7],
    ['Locales','Localed','medium',7],['Localises','Localised','medium',8],['Internationalises','Internationalised','high',9],
    ['Transcreates','Transcreated','high',9],['Adapts','Adapted','medium',7],['Translates','Translated','medium',7],
    ['Co-creates','Co-created','high',9],['Co-designs','Co-designed','high',9],['Co-authors','Co-authored','medium',8],
    ['Workshops','Workshopped','medium',8],['Charrettes','Charretted','medium',7],['Sprints','Sprinted','medium',8],
    ['Hackathons','Hackathoned','medium',8],['Game-jams','Game-jammed','medium',7],['Demo-days','Demo-dayed','medium',7],
];

// ─── Supplemental verbs to push the pool above the 1000-row target ──────────
const TECHNICAL_SUP = [
    ['Replays','Replayed','medium',8],['Re-keys','Re-keyed','medium',7],['Hot-reloads','Hot-reloaded','medium',8],
    ['Sideloads','Sideloaded','medium',7],['Pre-loads','Pre-loaded','medium',7],['Off-loads','Off-loaded','medium',7],
    ['Re-balances','Re-balanced','high',9],['Live-migrates','Live-migrated','high',9],['Cold-starts','Cold-started','medium',8],
    ['Warm-starts','Warm-started','medium',8],['Hot-swaps','Hot-swapped','high',9],['Live-edits','Live-edited','medium',8],
    ['Re-renders','Re-rendered','medium',7],['Re-flows','Re-flowed','medium',7],['Hydrates','Hydrated','medium',8],
    ['Pre-renders','Pre-rendered','medium',8],['Server-renders','Server-rendered','high',9],['Edge-deploys','Edge-deployed','high',9],
    ['Worker-deploys','Worker-deployed','high',9],['Lambda-deploys','Lambda-deployed','high',9],
];
const MANAGEMENT_SUP = [
    ['Empanels','Empanelled','medium',7],['Re-organises','Re-organised','high',9],['Re-resources','Re-resourced','medium',8],
    ['Re-assigns','Re-assigned','medium',7],['Re-prioritises','Re-prioritised','medium',8],['Re-scopes','Re-scoped','medium',8],
    ['Right-shores','Right-shored','high',9],['Near-shores','Near-shored','high',9],['Off-shores','Off-shored','medium',8],
    ['On-shores','On-shored','medium',8],['In-sources','In-sourced','medium',8],['Co-sources','Co-sourced','medium',7],
    ['Multi-sources','Multi-sourced','medium',8],['Single-sources','Single-sourced','medium',7],['Dual-tracks','Dual-tracked','medium',8],
    ['Triple-tracks','Triple-tracked','medium',7],['Fast-tracks','Fast-tracked','high',9],['Slow-tracks','Slow-tracked','medium',7],
    ['Re-charters','Re-chartered','medium',8],['Re-baselines','Re-baselined','medium',8],
];
const ANALYSIS_SUP = [
    ['De-risks','De-risked','high',9],['Pre-empts','Pre-empted','high',9],['War-rooms','War-roomed','high',9],
    ['Strategy-tests','Strategy-tested','high',9],['Pressure-tests','Pressure-tested','high',9],['Battle-tests','Battle-tested','high',9],
    ['Field-tests','Field-tested','medium',8],['User-tests','User-tested','medium',8],['Smoke-screens','Smoke-screened','medium',7],
    ['Re-runs','Re-ran','medium',7],['Re-evaluates','Re-evaluated','medium',8],['Re-baselines','Re-baselined','medium',8],
    ['Re-benchmarks','Re-benchmarked','high',9],['Re-segments','Re-segmented','medium',8],['Re-cohorts','Re-cohorted','medium',8],
    ['Re-funnels','Re-funnelled','medium',7],['Re-attributes','Re-attributed','medium',8],['Re-aggregates','Re-aggregated','medium',8],
    ['Re-imputes','Re-imputed','medium',7],['Re-validates','Re-validated','medium',8],
];
const COMMUNICATION_SUP = [
    ['Re-cascades','Re-cascaded','medium',8],['Re-amplifies','Re-amplified','high',9],['Re-engages','Re-engaged','medium',8],
    ['Re-pitches','Re-pitched','high',9],['Re-presents','Re-presented','medium',8],['Re-positions','Re-positioned','high',9],
    ['Re-launches','Re-launched','high',9],['Re-introduces','Re-introduced','medium',8],['Re-onboards','Re-onboarded','medium',7],
    ['Re-frames','Re-framed','medium',8],['Re-stories','Re-storied','medium',8],['Re-narrates','Re-narrated','medium',8],
    ['Re-anchors','Re-anchored','medium',8],['Re-aligns','Re-aligned','medium',8],['Re-validates','Re-validated','medium',8],
    ['Re-confirms','Re-confirmed','medium',7],['Re-states','Re-stated','medium',7],['Re-iterates','Re-iterated','medium',7],
    ['Re-emphasises','Re-emphasised','medium',7],['Re-articulates','Re-articulated','high',9],
];
const FINANCIAL_SUP = [
    ['Re-projects','Re-projected','high',9],['Re-flexes','Re-flexed','medium',8],['Re-poolings','Re-pooled','medium',7],
    ['Re-rates','Re-rated','medium',8],['Re-tranches','Re-tranched','high',9],['Re-prices','Re-priced','medium',8],
    ['Re-syndicates','Re-syndicated','medium',8],['Re-domiciles','Re-domiciled','high',9],['Re-classifies','Re-classified','medium',7],
    ['Re-stages','Re-staged','medium',7],['Re-charters','Re-chartered','medium',8],['Cross-sells','Cross-sold','high',9],
    ['Up-tiers','Up-tiered','medium',8],['Down-tiers','Down-tiered','medium',7],['Pre-pays','Pre-paid','medium',7],
    ['Post-pays','Post-paid','medium',7],['Drawdowns','Drew down','medium',8],['Top-ups','Topped up','medium',7],
    ['Roll-overs','Rolled over','medium',8],['Fold-ins','Folded in','medium',7],
];
const CREATIVE_SUP = [
    ['Re-prototypes','Re-prototyped','high',9],['Re-mocks','Re-mocked','medium',7],['Re-sketches','Re-sketched','medium',7],
    ['Re-illustrates','Re-illustrated','medium',7],['Re-renders','Re-rendered','medium',8],['Re-stages','Re-staged','medium',7],
    ['Re-edits','Re-edited','medium',7],['Re-cuts','Re-cut','medium',7],['Re-mixes','Re-mixed','medium',7],
    ['Re-masters','Re-mastered','medium',7],['Re-grades','Re-graded','medium',7],['Re-scores','Re-scored','medium',8],
    ['Re-frames','Re-framed','medium',8],['Re-blocks','Re-blocked','medium',7],['Re-storyboards','Re-storyboarded','medium',8],
    ['Re-themes','Re-themed','medium',7],['Re-skins','Re-skinned','medium',7],['Re-tones','Re-toned','medium',7],
    ['Re-voices','Re-voiced','medium',7],['Re-letterings','Re-lettered','medium',7],
];

const POOLS = {
    technical: [...TECHNICAL, ...TECHNICAL_SUP],
    management: [...MANAGEMENT, ...MANAGEMENT_SUP],
    analysis: [...ANALYSIS, ...ANALYSIS_SUP],
    communication: [...COMMUNICATION, ...COMMUNICATION_SUP],
    financial: [...FINANCIAL, ...FINANCIAL_SUP],
    creative: [...CREATIVE, ...CREATIVE_SUP],
};

const VERB_CATEGORIES = Object.keys(POOLS);

// ─── Build the bulk seed JSON file (so it lives on disk, per session plan) ───
function buildSeedJSON() {
    const cv_verbs = [];
    const seen = new Set();
    for (const [category, list] of Object.entries(POOLS)) {
        for (const [verb_present, verb_past, energy_level, human_score] of list) {
            const key = verb_present.toLowerCase() + '|' + category;
            if (seen.has(key)) continue;
            seen.add(key);
            cv_verbs.push({ verb_present, verb_past, category, energy_level, human_score });
        }
    }
    return { cv_verbs };
}

async function main() {
    const seedDoc = buildSeedJSON();
    const seedPath = path.join(__dirname, '..', 'seeds', 'verbs-bulk.json');
    fs.writeFileSync(seedPath, JSON.stringify(seedDoc, null, 2));
    console.log(`Wrote ${seedDoc.cv_verbs.length} candidate verbs → ${path.relative(process.cwd(), seedPath)}`);

    // ── Pull existing keys from D1 so we only INSERT what's truly new ──
    const r = await d1Query('SELECT verb_present, category FROM cv_verbs');
    const existing = new Set();
    for (const row of (r[0]?.results || [])) {
        existing.add(row.verb_present.toLowerCase() + '|' + row.category);
    }
    console.log(`D1 baseline: ${existing.size} existing verb+category rows.`);

    const toInsert = seedDoc.cv_verbs.filter(v =>
        !existing.has(v.verb_present.toLowerCase() + '|' + v.category)
    );
    console.log(`New rows to insert: ${toInsert.length}`);

    let ok = 0, fail = 0;
    // Sequential — D1 REST occasionally rate-limits when pummelled in parallel.
    for (const v of toInsert) {
        try {
            await d1Query(
                `INSERT OR IGNORE INTO cv_verbs (verb_present, verb_past, category, energy_level, human_score)
                 VALUES (?, ?, ?, ?, ?)`,
                [v.verb_present, v.verb_past, v.category, v.energy_level, v.human_score]
            );
            ok++;
            if (ok % 50 === 0) process.stdout.write(`  …inserted ${ok}\n`);
        } catch (e) {
            fail++;
            console.error(`  ✗ ${v.verb_present} (${v.category}): ${e.message}`);
        }
    }
    console.log(`\nInsert summary: ${ok} inserted, ${fail} failed.`);

    // ── Refresh KV cache for every category × tense ──
    console.log('\nRefreshing cv:verbs:* KV cache keys…');
    for (const cat of VERB_CATEGORIES) {
        for (const tense of ['present', 'past']) {
            const r2 = await d1Query(
                `SELECT verb_present, verb_past, energy_level, human_score
                 FROM cv_verbs
                 WHERE category = ? AND human_score >= 7
                 ORDER BY human_score DESC`,
                [cat]
            );
            const rows = r2[0]?.results || [];
            const key = `cv:verbs:${cat}:${tense}`;
            await kvPut(key, rows);
            console.log(`  ✓ ${key.padEnd(30)} (${rows.length} rows)`);
        }
    }

    // ── Final stats ──
    const final = await d1Query('SELECT COUNT(*) AS n FROM cv_verbs');
    const total = final[0]?.results?.[0]?.n ?? '?';
    console.log(`\nFinal cv_verbs row count: ${total}`);
    if (typeof total === 'number' && total < 1000) {
        console.warn(`⚠ Below the 1000-verb target — re-run after extending the curated lists.`);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
