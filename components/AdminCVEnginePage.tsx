import React, { useEffect, useState, useCallback } from 'react';
import {
    fetchAdminStats,
    bulkAddRows,
    triggerSync,
    getAdminToken,
    setAdminToken as saveAdminToken,
    type AdminStats,
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
    const [tab, setTab] = useState<'verb' | 'banned' | 'voice' | 'field' | 'opener'>('verb');

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
                {(['verb', 'banned', 'voice', 'field', 'opener'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium ${tab === t ? 'text-white border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'}`}>
                        {t === 'verb' ? 'Add Verb' : t === 'banned' ? 'Add Banned' : t === 'voice' ? 'Add Voice' : t === 'field' ? 'Add Field' : 'Add Opener'}
                    </button>
                ))}
            </div>

            {tab === 'verb' && <AddVerbForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'banned' && <AddBannedForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'voice' && <AddVoiceForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'field' && <AddFieldForm onDone={refresh} setMsg={setMsg} />}
            {tab === 'opener' && <AddOpenerForm onDone={refresh} setMsg={setMsg} />}
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
