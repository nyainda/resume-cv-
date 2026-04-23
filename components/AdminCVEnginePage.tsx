import React, { useEffect, useState, useCallback } from 'react';
import {
    fetchAdminStats,
    bulkAddRows,
    triggerSync,
    getAdminToken,
    setAdminToken as saveAdminToken,
    listAdminRows,
    bulkUpdateRows,
    deleteAdminRows,
    testVoice,
    aiAudit,
    type AdminStats,
    type VoiceTestResult,
    type AiAuditResult,
} from '../services/cvEngineClient';

const TABLE_LABELS: Record<string, string> = {
    cv_verbs: 'Verbs',
    cv_banned_phrases: 'Banned phrases',
    cv_openers: 'Openers',
    cv_context_connectors: 'Context connectors',
    cv_result_connectors: 'Result connectors',
    cv_sentence_structures: 'Sentence structures',
    cv_rhythm_patterns: 'Rhythm patterns',
    cv_paragraph_structures: 'Paragraph structures',
    cv_subjects: 'Subjects',
    cv_seniority_levels: 'Seniority levels',
    cv_field_profiles: 'Field profiles',
    cv_seniority_field_combos: 'Seniority/field combos',
    cv_voice_profiles: 'Voice profiles',
};

const VERB_CATS = ['technical', 'management', 'analysis', 'communication', 'financial', 'creative'] as const;
const BANNED_SEVERITY = ['critical', 'high', 'medium'] as const;

export default function AdminCVEnginePage(): JSX.Element {
    const [token, setTokenState] = useState<string>(getAdminToken() || '');
    const [authed, setAuthed] = useState<boolean>(Boolean(getAdminToken()));
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [msg, setMsg] = useState<string>('');
    const [tab, setTab] = useState<'verb' | 'banned_word' | 'banned' | 'voice' | 'field' | 'opener' | 'browse' | 'voice_test' | 'ai_audit'>('verb');

    const refresh = useCallback(async () => {
        setLoading(true);
        const s = await fetchAdminStats();
        setStats(s);
        setLoading(false);
        if (!s) setMsg('Could not load stats — check your admin token.');
    }, []);

    useEffect(() => { if (authed) void refresh(); }, [authed, refresh]);

    const onSaveToken = () => {
        saveAdminToken(token.trim());
        setAuthed(true);
        setMsg('');
    };

    const onClearToken = () => {
        saveAdminToken('');
        setAuthed(false);
        setStats(null);
        setTokenState('');
    };

    const onSync = async () => {
        setLoading(true); setMsg('');
        const r = await triggerSync();
        setLoading(false);
        if (r?.ok) { setMsg(`KV cache rebuilt (${r.total_keys} keys).`); void refresh(); }
        else setMsg('Sync failed — check token.');
    };

    const lastSyncStr = stats?.last_sync ? new Date(stats.last_sync).toLocaleString() : 'never';

    if (!authed) {
        return (
            <div className="p-6">
                <h1 className="text-xl font-semibold text-white mb-3">CV Engine Admin</h1>
                <p className="text-slate-400 mb-4 text-sm">Enter the admin token (the value of the worker's <code className="text-amber-300">ADMIN_TOKEN</code> secret) to manage the engine database.</p>
                <div className="flex gap-2 max-w-xl">
                    <input
                        type="password"
                        value={token}
                        onChange={e => setTokenState(e.target.value)}
                        placeholder="Admin token"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                    />
                    <button onClick={onSaveToken} disabled={!token.trim()} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">Connect</button>
                </div>
                {msg && <p className="text-amber-300 text-sm mt-3">{msg}</p>}
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-semibold text-white">CV Engine Admin</h1>
                    <p className="text-slate-400 text-sm mt-1">Last KV sync: <span className="text-slate-200">{lastSyncStr}</span></p>
                </div>
                <div className="flex gap-2">
                    <button onClick={refresh} disabled={loading} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:opacity-40">{loading ? 'Loading…' : 'Refresh'}</button>
                    <button onClick={onSync} disabled={loading} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-40">Sync KV</button>
                    <button onClick={onClearToken} className="px-3 py-1.5 rounded bg-rose-700/70 hover:bg-rose-600 text-white text-sm">Sign out</button>
                </div>
            </div>

            {msg && <div className="text-sm text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded px-3 py-2">{msg}</div>}

            {/* Counts grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(stats?.counts || {}).map(([table, n]) => (
                    <div key={table} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                        <div className="text-slate-400 text-xs uppercase tracking-wide">{TABLE_LABELS[table] || table}</div>
                        <div className="text-2xl font-semibold text-white mt-1">{n}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-700">
                {(['verb', 'banned_word', 'banned', 'voice', 'field', 'opener', 'browse', 'voice_test', 'ai_audit'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium ${tab === t ? 'text-white border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'}`}>
                        {t === 'verb' ? 'Add Verb' : t === 'banned_word' ? 'Add Banned Word' : t === 'banned' ? 'Add Banned Phrase' : t === 'voice' ? 'Add Voice' : t === 'field' ? 'Add Field' : t === 'opener' ? 'Add Opener' : t === 'browse' ? 'Browse / Edit' : t === 'voice_test' ? 'Voice Tester' : 'AI Auditor'}
                    </button>
                ))}
            </div>

            {tab === 'verb' && <AddVerbForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'banned_word' && <AddBannedWordForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'banned' && <AddBannedForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'voice' && <AddVoiceForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'field' && <AddFieldForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'opener' && <AddOpenerForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'browse' && <BrowseEditTab onDone={refresh} setMsg={setMsg} />}
            {tab === 'voice_test' && <VoiceTesterTab setMsg={setMsg} />}
            {tab === 'ai_audit' && <AiAuditTab onDone={refresh} setMsg={setMsg} />}
        </div>
    );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

interface FormProps { onDone: () => void; setMsg: (s: string) => void; }

function AddVerbForm({ onDone, setMsg }: FormProps) {
    const [bulk, setBulk] = useState('');
    const [present, setPresent] = useState('');
    const [past, setPast] = useState('');
    const [category, setCategory] = useState<typeof VERB_CATS[number]>('technical');
    const [energy, setEnergy] = useState<'high' | 'medium' | 'low'>('high');
    const [score, setScore] = useState(8);
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const rows: any[] = [];
        if (bulk.trim()) {
            for (const line of bulk.split('\n')) {
                const parts = line.split(',').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    rows.push({ verb_present: parts[0], verb_past: parts[1], category: parts[2] || category, energy_level: parts[3] || energy, human_score: Number(parts[4]) || score });
                }
            }
        } else if (present && past) {
            rows.push({ verb_present: present, verb_past: past, category, energy_level: energy, human_score: score });
        }
        if (!rows.length) { setMsg('Enter at least one verb (or paste lines).'); return; }
        setBusy(true);
        const r = await bulkAddRows('cv_verbs', rows);
        setBusy(false);
        if (r) {
            setMsg(`Verbs: ${r.inserted} added, ${r.skipped} duplicates, ${r.failed} failed${r.synced ? ' — KV synced' : ''}.`);
            setBulk(''); setPresent(''); setPast(''); onDone();
        } else { setMsg('Insert failed — check token / network.'); }
    };

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Add a single verb, or paste a CSV block (one per line: <code className="text-amber-300">present, past, category, energy, score</code>).</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input value={present} onChange={e => setPresent(e.target.value)} placeholder="Designs" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <input value={past} onChange={e => setPast(e.target.value)} placeholder="Designed" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={category} onChange={e => setCategory(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {VERB_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={energy} onChange={e => setEnergy(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {['high', 'medium', 'low'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min={1} max={10} value={score} onChange={e => setScore(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            </div>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={6} placeholder={'Paste CSV — e.g.\nShipped, Shipped, technical, high, 9\nDeployed, Deployed, technical, high, 9'} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Verb(s)'}</button>
        </div>
    );
}

const BUZZWORD_SEED_PACK = [
    'synergy', 'leverage', 'leveraging', 'robust', 'seamless', 'seamlessly', 'cutting-edge',
    'innovative', 'innovatively', 'disruptive', 'paradigm', 'holistic', 'holistically',
    'streamline', 'streamlined', 'streamlining', 'utilize', 'utilized', 'utilizing',
    'utilization', 'spearhead', 'spearheaded', 'orchestrate', 'orchestrated',
    'passionate', 'detail-oriented', 'self-starter', 'go-getter', 'rockstar', 'ninja',
    'guru', 'visionary', 'thought-leader', 'evangelist', 'wheelhouse',
    'ideate', 'ideated', 'ideation', 'actionable', 'impactful', 'meaningful',
    'transformative', 'world-class', 'best-in-class', 'next-generation', 'next-gen',
    'mission-critical', 'value-add', 'value-added', 'turnkey', 'agile-minded',
    'results-driven', 'results-oriented', 'goal-oriented', 'team-player',
    'hardworking', 'hard-working', 'dynamic', 'proactive', 'proactively',
    'go-to', 'best-of-breed', 'low-hanging', 'deep-dive', 'circle-back', 'pivot',
];

function AddBannedWordForm({ onDone, setMsg }: FormProps) {
    const [word, setWord] = useState('');
    const [replacement, setReplacement] = useState('');
    const [severity, setSeverity] = useState<typeof BANNED_SEVERITY[number]>('high');
    const [bulk, setBulk] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (rowsOverride?: any[]) => {
        let rows: any[] = rowsOverride || [];
        if (!rowsOverride) {
            if (bulk.trim()) {
                for (const raw of bulk.split(/[\n,]/)) {
                    const w = raw.trim();
                    if (!w) continue;
                    if (w.includes(' ')) { setMsg(`"${w}" has spaces — use the Banned Phrase tab for multi-word entries.`); return; }
                    rows.push({ phrase: w, replacement: '', severity, reason: 'banned_word' });
                }
            } else if (word) {
                if (word.includes(' ')) { setMsg('Use the Banned Phrase tab for multi-word entries.'); return; }
                rows.push({ phrase: word.trim(), replacement, severity, reason: 'banned_word' });
            }
        }
        if (!rows.length) { setMsg('Enter at least one word.'); return; }
        setBusy(true);
        const r = await bulkAddRows('cv_banned_phrases', rows);
        setBusy(false);
        if (r) {
            setMsg(`Banned words: ${r.inserted} added, ${r.skipped} duplicates, ${r.failed} failed${r.synced ? ' — KV synced' : ''}.`);
            setBulk(''); setWord(''); setReplacement(''); onDone();
        } else { setMsg('Insert failed — check token / network.'); }
    };

    const seedBuzzwords = () =>
        submit(BUZZWORD_SEED_PACK.map(w => ({ phrase: w, replacement: '', severity: 'high', reason: 'buzzword_seed' })));

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Add a single banned word, or paste a list (one per line — or comma-separated). Stored alongside banned phrases; the engine matches them with whole-word boundaries so single tokens like <code className="text-amber-300">synergy</code> only flag exact word hits, not substrings.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input value={word} onChange={e => setWord(e.target.value)} placeholder="synergy" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <input value={replacement} onChange={e => setReplacement(e.target.value)} placeholder="optional replacement" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={severity} onChange={e => setSeverity(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {BANNED_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={6} placeholder={'paste one word per line or comma-separated:\nleverage\nrobust\nseamless\npassionate, dynamic, proactive'} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
            <div className="flex flex-wrap gap-2">
                <button onClick={() => submit()} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Banned Word(s)'}</button>
                <button onClick={seedBuzzwords} disabled={busy} className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium" title={`Seed ${BUZZWORD_SEED_PACK.length} common AI/CV buzzwords in one click`}>Seed {BUZZWORD_SEED_PACK.length} common buzzwords</button>
            </div>
        </div>
    );
}

function AddBannedForm({ onDone, setMsg }: FormProps) {
    const [phrase, setPhrase] = useState('');
    const [replacement, setReplacement] = useState('');
    const [severity, setSeverity] = useState<typeof BANNED_SEVERITY[number]>('high');
    const [reason, setReason] = useState('');
    const [bulk, setBulk] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const rows: any[] = [];
        if (bulk.trim()) {
            for (const line of bulk.split('\n')) {
                const parts = line.split('|').map(s => s.trim());
                if (parts[0]) rows.push({ phrase: parts[0], replacement: parts[1] || '', severity: parts[2] || severity, reason: parts[3] || 'admin' });
            }
        } else if (phrase) {
            rows.push({ phrase, replacement, severity, reason: reason || 'admin' });
        }
        if (!rows.length) { setMsg('Enter at least one banned phrase.'); return; }
        setBusy(true);
        const r = await bulkAddRows('cv_banned_phrases', rows);
        setBusy(false);
        if (r) {
            setMsg(`Banned: ${r.inserted} added, ${r.skipped} duplicates, ${r.failed} failed${r.synced ? ' — KV synced' : ''}.`);
            setBulk(''); setPhrase(''); setReplacement(''); setReason(''); onDone();
        } else { setMsg('Insert failed.'); }
    };

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Add one phrase or paste a list — pipe-separated: <code className="text-amber-300">phrase | replacement | severity | reason</code>.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="passionate about" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <input value={replacement} onChange={e => setReplacement(e.target.value)} placeholder="focused on (optional)" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={severity} onChange={e => setSeverity(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {BANNED_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="reason (optional)" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            </div>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={6} placeholder={'paradigm shift | major change | critical | buzzword\nlow-hanging fruit | easy wins | high | cliche'} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Banned Phrase(s)'}</button>
        </div>
    );
}

function AddVoiceForm({ onDone, setMsg }: FormProps) {
    const [name, setName] = useState('');
    const [tone, setTone] = useState('');
    const [verbosity, setVerbosity] = useState(3);
    const [metric, setMetric] = useState<'high' | 'medium' | 'low'>('medium');
    const [opener, setOpener] = useState(0.25);
    const [verbBias, setVerbBias] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!name || !tone) { setMsg('Name and tone are required.'); return; }
        const row = {
            name, tone, description: tone,
            verbosity_level: verbosity, metric_preference: metric, opener_frequency: opener,
            risk_tolerance: 'safe', formality: 'neutral',
            compatible_fields: [], compatible_seniority: ['mid', 'senior'], incompatible_with: [],
            verb_bias: verbBias.split(',').map(s => s.trim()).filter(Boolean),
            structure_bias: ['short', 'medium'],
        };
        setBusy(true);
        const r = await bulkAddRows('cv_voice_profiles', [row]);
        setBusy(false);
        if (r?.inserted) { setMsg('Voice added.'); setName(''); setTone(''); setVerbBias(''); onDone(); }
        else setMsg(r ? 'No insert (likely duplicate name).' : 'Insert failed.');
    };

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="voice name (e.g. mentor_calm)" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <input value={tone} onChange={e => setTone(e.target.value)} placeholder="tone (e.g. patient, teacher)" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={metric} onChange={e => setMetric(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {['high', 'medium', 'low'].map(s => <option key={s} value={s}>metric: {s}</option>)}
                </select>
                <label className="flex items-center gap-2 text-slate-300 text-sm">verbosity 1-5
                    <input type="number" min={1} max={5} value={verbosity} onChange={e => setVerbosity(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" />
                </label>
                <label className="flex items-center gap-2 text-slate-300 text-sm">opener freq
                    <input type="number" step={0.05} min={0} max={1} value={opener} onChange={e => setOpener(Number(e.target.value))} className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" />
                </label>
            </div>
            <input value={verbBias} onChange={e => setVerbBias(e.target.value)} placeholder="verb bias, comma-sep (e.g. mentored, guided, coached)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Voice'}</button>
        </div>
    );
}

function AddFieldForm({ onDone, setMsg }: FormProps) {
    const [field, setField] = useState('');
    const [style, setStyle] = useState('technical');
    const [preferred, setPreferred] = useState('');
    const [avoided, setAvoided] = useState('');
    const [metrics, setMetrics] = useState('');
    const [keywords, setKeywords] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!field) { setMsg('Field name required.'); return; }
        const split = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
        const row = {
            field, language_style: style,
            preferred_verbs: split(preferred), avoided_verbs: split(avoided),
            metric_types: split(metrics), jd_keywords: split(keywords),
        };
        setBusy(true);
        const r = await bulkAddRows('cv_field_profiles', [row]);
        setBusy(false);
        if (r?.inserted) { setMsg('Field added.'); setField(''); setPreferred(''); setAvoided(''); setMetrics(''); setKeywords(''); onDone(); }
        else setMsg(r ? 'No insert (likely duplicate field).' : 'Insert failed.');
    };

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-2">
                <input value={field} onChange={e => setField(e.target.value)} placeholder="field key (e.g. real_estate)" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={style} onChange={e => setStyle(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {['technical', 'analytical', 'commercial', 'humanistic', 'creative', 'field_practical'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <input value={preferred} onChange={e => setPreferred(e.target.value)} placeholder="preferred verbs (comma-sep)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            <input value={avoided} onChange={e => setAvoided(e.target.value)} placeholder="avoided verbs (comma-sep)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            <input value={metrics} onChange={e => setMetrics(e.target.value)} placeholder="metric types (comma-sep)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="JD keywords for field detection (comma-sep)" className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Field'}</button>
        </div>
    );
}

function AddOpenerForm({ onDone, setMsg }: FormProps) {
    const [opener, setOpener] = useState('');
    const [type, setType] = useState('context');
    const [example, setExample] = useState('');
    const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!opener) { setMsg('Opener text required.'); return; }
        setBusy(true);
        const r = await bulkAddRows('cv_openers', [{ opener, type, triggers_comma: 1, example, length_type: length }]);
        setBusy(false);
        if (r?.inserted) { setMsg('Opener added.'); setOpener(''); setExample(''); onDone(); }
        else setMsg(r ? 'No insert (likely duplicate).' : 'Insert failed.');
    };

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input value={opener} onChange={e => setOpener(e.target.value)} placeholder="At {company}," className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <select value={type} onChange={e => setType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {['none', 'context', 'time', 'situation', 'achievement'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={length} onChange={e => setLength(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {['short', 'medium', 'long'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={example} onChange={e => setExample(e.target.value)} placeholder="example sentence" className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
            </div>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">{busy ? 'Adding…' : 'Add Opener'}</button>
        </div>
    );
}

// ─── Browse / Edit / Delete ──────────────────────────────────────────────────

function BrowseEditTab({ onDone, setMsg }: FormProps) {
    const [table, setTable] = useState<string>('cv_banned_phrases');
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<Array<Record<string, any>>>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [limit] = useState(100);
    const [loading, setLoading] = useState(false);
    const [edits, setEdits] = useState<Record<string, Record<string, any>>>({});

    const load = useCallback(async () => {
        setLoading(true); setMsg('');
        const r = await listAdminRows(table, { limit, offset, q: q.trim() || undefined });
        setLoading(false);
        if (!r) { setMsg('Could not load rows.'); return; }
        setRows(r.rows);
        setTotal(r.total);
        setEdits({});
    }, [table, limit, offset, q, setMsg]);

    useEffect(() => { void load(); }, [table, offset]); // eslint-disable-line react-hooks/exhaustive-deps

    const onCellChange = (id: string, col: string, val: string) => {
        setEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [col]: val } }));
    };

    const saveRow = async (id: string) => {
        const patch = edits[id];
        if (!patch || Object.keys(patch).length === 0) { setMsg('No changes for that row.'); return; }
        const r = await bulkUpdateRows(table, [{ id, ...patch }]);
        if (!r) { setMsg('Update failed.'); return; }
        setMsg(`Updated ${r.updated}, missing ${r.missing}, failed ${r.failed}${r.synced ? ' — KV synced' : ''}.`);
        if (r.updated > 0) { await load(); onDone(); }
    };

    const deleteRow = async (id: string) => {
        if (!confirm('Delete this row? This cannot be undone.')) return;
        const r = await deleteAdminRows(table, [id]);
        if (!r) { setMsg('Delete failed.'); return; }
        setMsg(`Deleted ${r.deleted}${r.synced ? ' — KV synced' : ''}.`);
        if (r.deleted > 0) { await load(); onDone(); }
    };

    const cols = rows[0] ? Object.keys(rows[0]).filter(c => c !== 'id') : [];
    const editableCols = ADMIN_EDITABLE[table] || cols;

    return (
        <div className="space-y-3 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-wrap gap-2 items-center">
                <select value={table} onChange={e => { setTable(e.target.value); setOffset(0); }} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm">
                    {Object.keys(TABLE_LABELS).map(t => <option key={t} value={t}>{TABLE_LABELS[t]}</option>)}
                </select>
                <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); void load(); } }} placeholder="search…" className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
                <button onClick={() => { setOffset(0); void load(); }} disabled={loading} className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm">{loading ? 'Loading…' : 'Search'}</button>
                <span className="text-slate-400 text-xs ml-auto">{total} total · showing {offset + 1}–{Math.min(offset + rows.length, total)}</span>
                <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0 || loading} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white text-sm">‹ Prev</button>
                <button onClick={() => setOffset(offset + limit)} disabled={offset + rows.length >= total || loading} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white text-sm">Next ›</button>
            </div>

            <div className="overflow-x-auto border border-slate-700 rounded">
                <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px]">
                        <tr>
                            {cols.map(c => <th key={c} className="px-2 py-1.5 font-medium">{c}</th>)}
                            <th className="px-2 py-1.5 w-32 text-right">actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => {
                            const id = String(row.id);
                            const dirty = Boolean(edits[id]);
                            return (
                                <tr key={id} className="border-t border-slate-800 hover:bg-slate-900/40">
                                    {cols.map(c => {
                                        const isEditable = editableCols.includes(c);
                                        const val = edits[id]?.[c] ?? row[c] ?? '';
                                        const display = typeof val === 'object' ? JSON.stringify(val) : String(val);
                                        return (
                                            <td key={c} className="px-2 py-1 align-top max-w-[260px]">
                                                {isEditable ? (
                                                    <input value={display} onChange={e => onCellChange(id, c, e.target.value)} className="w-full bg-slate-900/60 border border-slate-700 rounded px-1.5 py-1 text-white" />
                                                ) : (
                                                    <span className="text-slate-400 truncate block" title={display}>{display}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1 text-right whitespace-nowrap">
                                        <button onClick={() => saveRow(id)} disabled={!dirty} className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-xs mr-1">Save</button>
                                        <button onClick={() => deleteRow(id)} className="px-2 py-0.5 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs">Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length === 0 && !loading && (
                            <tr><td colSpan={cols.length + 1} className="px-3 py-6 text-center text-slate-500">No rows.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Whitelist of editable columns per table — id is never editable.
const ADMIN_EDITABLE: Record<string, string[]> = {
    cv_verbs: ['verb_present', 'verb_past', 'category', 'energy_level', 'human_score', 'formality', 'industry'],
    cv_banned_phrases: ['phrase', 'replacement', 'severity', 'reason', 'source'],
    cv_openers: ['opener', 'type', 'triggers_comma', 'example', 'length_type'],
    cv_context_connectors: ['connector', 'type', 'example'],
    cv_result_connectors: ['connector', 'type', 'example', 'human_score'],
    cv_sentence_structures: ['pattern_label', 'pattern', 'word_count_min', 'word_count_max', 'example', 'use_frequency', 'section'],
    cv_rhythm_patterns: ['pattern_name', 'sequence', 'section', 'bullet_count', 'description', 'human_score'],
    cv_paragraph_structures: ['section', 'sentence_count', 'pattern', 'word_count_min', 'word_count_max', 'rules'],
    cv_subjects: ['subject', 'usage', 'allowed_sections'],
    cv_seniority_levels: ['level', 'years_min', 'years_max', 'bullet_style', 'metric_density', 'summary_tone', 'forbidden_phrases'],
    cv_field_profiles: ['field', 'language_style', 'preferred_verbs', 'avoided_verbs', 'metric_types', 'jd_keywords'],
    cv_seniority_field_combos: ['seniority', 'field', 'forbidden_phrases', 'required_tone', 'notes'],
    cv_voice_profiles: ['name', 'tone', 'description', 'verbosity_level', 'metric_preference', 'opener_frequency', 'risk_tolerance', 'formality', 'compatible_fields', 'compatible_seniority', 'incompatible_with', 'verb_bias', 'structure_bias'],
};

// ─── Voice Tester Tab ────────────────────────────────────────────────────────
function VoiceTesterTab({ setMsg }: { setMsg: (s: string) => void }) {
    const [voices, setVoices] = useState<Array<{ id: string; name: string; tone?: string }>>([]);
    const [fields, setFields] = useState<string[]>([]);
    const [voiceName, setVoiceName] = useState<string>('');
    const [field, setField] = useState<string>('');
    const [years, setYears] = useState<number>(3);
    const [section, setSection] = useState<'current_role' | 'past_role' | 'internship' | 'summary'>('current_role');
    const [bullets, setBullets] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<VoiceTestResult | null>(null);

    useEffect(() => {
        (async () => {
            const v = await listAdminRows('cv_voice_profiles', { limit: 200 });
            const f = await listAdminRows('cv_field_profiles', { limit: 200 });
            if (v?.rows) setVoices(v.rows.map((r: any) => ({ id: r.id, name: r.name, tone: r.tone })));
            if (f?.rows) setFields(f.rows.map((r: any) => String(r.field)).filter(Boolean));
        })();
    }, []);

    const submit = async () => {
        const lines = bullets.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length === 0) { setMsg('Paste at least one bullet to test.'); return; }
        if (!voiceName) { setMsg('Pick a voice profile to force.'); return; }
        setBusy(true); setResult(null);
        const r = await testVoice({
            bullets: lines,
            voice_name: voiceName,
            field: field || undefined,
            yearsExperience: years,
            section,
        });
        setBusy(false);
        if (!r) { setMsg('Voice test failed — check token / network.'); return; }
        setResult(r);
        setMsg(`Voice tester: ${r.validation.passed ? 'PASS' : 'FAIL'} — score ${r.validation.score}/10, ${r.validation.issues.length} issue(s).`);
    };

    const sevColor = (s: string) =>
        s === 'critical' ? 'text-rose-300 bg-rose-950/40 border-rose-900/60'
        : s === 'high' ? 'text-orange-300 bg-orange-950/40 border-orange-900/60'
        : s === 'medium' ? 'text-amber-300 bg-amber-950/30 border-amber-900/50'
        : 'text-slate-300 bg-slate-800/40 border-slate-700';

    const issuesByBullet = (() => {
        const map = new Map<number | 'global', any[]>();
        if (!result) return map;
        for (const it of result.validation.issues) {
            const k = typeof it.bullet === 'number' ? it.bullet : 'global';
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(it);
        }
        return map;
    })();

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <p className="text-slate-300 text-sm">Force a voice profile + field + seniority, paste candidate bullets, and see exactly which voice rules pass or fail. Useful to QA a voice profile before approving it for production.</p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <label className="text-xs text-slate-400">
                    Voice
                    <select value={voiceName} onChange={e => setVoiceName(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-white text-sm">
                        <option value="">— choose —</option>
                        {voices.map(v => <option key={v.id} value={v.name}>{v.name}{v.tone ? ` (${v.tone})` : ''}</option>)}
                    </select>
                </label>
                <label className="text-xs text-slate-400">
                    Field (optional)
                    <select value={field} onChange={e => setField(e.target.value)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-white text-sm">
                        <option value="">auto-detect</option>
                        {fields.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </label>
                <label className="text-xs text-slate-400">
                    Years experience
                    <input type="number" min={0} max={40} value={years} onChange={e => setYears(Number(e.target.value) || 0)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-white text-sm" />
                </label>
                <label className="text-xs text-slate-400">
                    Section
                    <select value={section} onChange={e => setSection(e.target.value as any)} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-white text-sm">
                        <option value="current_role">current_role</option>
                        <option value="past_role">past_role</option>
                        <option value="internship">internship</option>
                        <option value="summary">summary</option>
                    </select>
                </label>
            </div>

            <textarea
                value={bullets}
                onChange={e => setBullets(e.target.value)}
                rows={8}
                placeholder={'Paste one bullet per line, e.g.\nLed redesign of checkout flow, lifting conversion 18% in 6 weeks.\nShipped React micro-frontend serving 240k MAU with sub-200ms TTI.\nMentored 4 engineers; cut PR review time from 3 days to 6 hours.'}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono"
            />

            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">
                {busy ? 'Testing…' : 'Test against voice'}
            </button>

            {result && (
                <div className="space-y-4 mt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <Stat label="Verdict" value={result.validation.passed ? 'PASS' : 'FAIL'} accent={result.validation.passed ? 'text-emerald-300' : 'text-rose-300'} />
                        <Stat label="Score" value={`${result.validation.score}/10`} />
                        <Stat label="Avg words" value={String(result.validation.avg_word_count)} />
                        <Stat label="Metric ratio" value={String(result.validation.metric_ratio)} />
                        <Stat label="Rhythm match" value={`${Math.round((result.validation.rhythm_match_ratio || 0) * 100)}%`} />
                    </div>

                    <div className="bg-slate-900/60 border border-slate-700 rounded p-3 text-xs text-slate-300 space-y-1">
                        <div><span className="text-slate-500">Voice forced:</span> <span className="text-white">{result.brief.voice.primary?.name || '—'}</span> <span className="text-slate-500">({result.brief.voice.primary?.tone || '—'}, verbosity {result.brief.voice.primary?.verbosity_level ?? '—'}, metrics {result.brief.voice.primary?.metric_preference || '—'})</span></div>
                        <div><span className="text-slate-500">Field:</span> <span className="text-white">{result.brief.field?.field || '—'}</span> <span className="text-slate-500">/ Seniority:</span> <span className="text-white">{result.brief.seniority?.level || '—'}</span></div>
                        <div><span className="text-slate-500">Rhythm:</span> <span className="text-white">{result.brief.rhythm?.pattern_name || '—'}</span> <span className="text-slate-500">[{(result.brief.rhythm?.sequence || []).join(', ')}]</span></div>
                        {result.brief.forbidden_phrases?.length > 0 && (
                            <div><span className="text-slate-500">Forbidden phrases:</span> <span className="text-rose-300">{result.brief.forbidden_phrases.join(', ')}</span></div>
                        )}
                    </div>

                    <div className="space-y-2">
                        {result.bullets.map((b, i) => {
                            const its = issuesByBullet.get(i) || [];
                            return (
                                <div key={i} className={`border rounded p-3 ${its.some(x => x.severity === 'critical' || x.severity === 'high') ? 'border-rose-900/60 bg-rose-950/20' : its.length ? 'border-amber-900/50 bg-amber-950/20' : 'border-emerald-900/50 bg-emerald-950/20'}`}>
                                    <div className="text-slate-200 text-sm"><span className="text-slate-500 mr-2">#{i + 1}</span>{b}</div>
                                    {its.length > 0 ? (
                                        <ul className="mt-2 space-y-1">
                                            {its.map((x, j) => (
                                                <li key={j} className={`text-xs px-2 py-1 rounded border inline-block mr-2 ${sevColor(x.severity)}`}>
                                                    <span className="font-semibold">{x.severity}</span> · {x.issue}{x.verb ? `: "${x.verb}"` : ''}{x.phrase ? `: "${x.phrase}"` : ''}{x.expected ? ` (expected ${x.expected}, got ${x.actual})` : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="mt-1 text-xs text-emerald-400">no issues</div>
                                    )}
                                </div>
                            );
                        })}
                        {(issuesByBullet.get('global') || []).length > 0 && (
                            <div className="border border-amber-900/50 bg-amber-950/20 rounded p-3">
                                <div className="text-slate-300 text-xs uppercase tracking-wide mb-2">Global issues</div>
                                <ul className="space-y-1">
                                    {(issuesByBullet.get('global') || []).map((x, j) => (
                                        <li key={j} className={`text-xs px-2 py-1 rounded border inline-block mr-2 ${sevColor(x.severity)}`}>
                                            <span className="font-semibold">{x.severity}</span> · {x.issue} {x.avg_words !== undefined ? `(avg ${x.avg_words}, target ${x.target})` : ''}{x.ratio !== undefined ? `(ratio ${x.ratio}, ${x.preference})` : ''}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="bg-slate-900/60 border border-slate-700 rounded px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-lg font-semibold ${accent || 'text-white'}`}>{value}</div>
        </div>
    );
}

// ─── AI Auditor Tab ──────────────────────────────────────────────────────────
function AiAuditTab({ onDone, setMsg }: FormProps) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<AiAuditResult | null>(null);
    const [picked, setPicked] = useState<Set<number>>(new Set());

    const submit = async () => {
        if (!text.trim()) { setMsg('Paste some CV text to audit.'); return; }
        setBusy(true); setResult(null); setPicked(new Set());
        const r = await aiAudit(text);
        setBusy(false);
        if (!r) { setMsg('AI audit failed — check token / network.'); return; }
        setResult(r);
        setPicked(new Set(r.findings.map((_, i) => i)));
        setMsg(`AI auditor: ${r.new_findings} new finding(s) (${r.already_banned_count} already in banned list).`);
    };

    const togglePick = (i: number) => {
        const next = new Set(picked);
        if (next.has(i)) next.delete(i); else next.add(i);
        setPicked(next);
    };

    const promote = async () => {
        if (!result) return;
        const rows = Array.from(picked).map(i => result.findings[i]).filter(Boolean).map(f => ({
            phrase: f.phrase,
            replacement: f.replacement || '',
            severity: f.severity,
            reason: `ai_audit: ${f.reason}`.slice(0, 200),
        }));
        if (rows.length === 0) { setMsg('Pick at least one finding to promote.'); return; }
        setBusy(true);
        const r = await bulkAddRows('cv_banned_phrases', rows);
        setBusy(false);
        if (r) {
            setMsg(`Promoted ${r.inserted} to banned list (${r.skipped} duplicates, ${r.failed} failed${r.synced ? ' — KV synced' : ''}).`);
            setResult(null); setPicked(new Set()); onDone();
        } else { setMsg('Promote failed — check token.'); }
    };

    const sevColor = (s: string) =>
        s === 'critical' ? 'border-rose-900/60 bg-rose-950/30 text-rose-200'
        : s === 'high' ? 'border-orange-900/60 bg-orange-950/30 text-orange-200'
        : 'border-amber-900/50 bg-amber-950/20 text-amber-200';

    return (
        <div className="space-y-4 bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-300 text-sm space-y-1">
                <p>Second-pass auditor running on Workers AI (<code className="text-amber-300">@cf/meta/llama-3.1-8b-instruct</code>). Paste any CV text, get AI-ism candidates the deterministic rules don't already catch, then one-click promote them into the banned list.</p>
                <p className="text-slate-500 text-xs">The deterministic regex/word-count rules stay as the fast first pass — this is purely a discovery tool to grow the banned vocabulary.</p>
            </div>

            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={10}
                placeholder={'Paste CV text, a job description, or a bullet list. Example:\n• Leveraged cutting-edge AI to drive synergy across cross-functional stakeholders.\n• Spearheaded transformative initiatives to deliver world-class solutions.\n• Passionate self-starter with a results-driven mindset.'}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono"
            />

            <div className="flex flex-wrap items-center gap-2">
                <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium">
                    {busy ? 'Asking Workers AI…' : 'Run AI audit'}
                </button>
                <span className="text-slate-500 text-xs">{text.length}/8000 chars</span>
            </div>

            {result && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                        <span>Model: <span className="text-slate-200">{result.model}</span></span>
                        <span>Already banned: <span className="text-slate-200">{result.already_banned_count}</span></span>
                        <span>New findings: <span className="text-emerald-300">{result.new_findings}</span></span>
                    </div>

                    {result.findings.length === 0 ? (
                        <div className="text-emerald-300 text-sm bg-emerald-950/30 border border-emerald-900/50 rounded px-3 py-2">No new AI-isms detected — text is already clean (or banned list already covers them).</div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {result.findings.map((f, i) => (
                                    <label key={i} className={`flex items-start gap-3 border rounded p-3 cursor-pointer ${sevColor(f.severity)}`}>
                                        <input type="checkbox" checked={picked.has(i)} onChange={() => togglePick(i)} className="mt-1" />
                                        <div className="flex-1 text-sm">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-white">"{f.phrase}"</span>
                                                <span className="text-[10px] uppercase tracking-wide opacity-70">{f.severity}</span>
                                                {f.replacement && <span className="text-emerald-300">→ "{f.replacement}"</span>}
                                            </div>
                                            <div className="text-xs opacity-80 mt-1">{f.reason}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={promote} disabled={busy || picked.size === 0} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium">
                                    {busy ? 'Promoting…' : `Promote ${picked.size} to banned list`}
                                </button>
                                <button onClick={() => setPicked(new Set(result.findings.map((_, i) => i)))} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs">Select all</button>
                                <button onClick={() => setPicked(new Set())} className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs">Clear</button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
