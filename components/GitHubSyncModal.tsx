import React, { useState, useCallback, useEffect } from 'react';
import { CVData, PersonalInfo, TemplateName, SavedCV } from '../types';

interface GitHubSyncModalProps {
  savedCVs: SavedCV[];
  currentCV: CVData | null;
  personalInfo: PersonalInfo | null;
  onClose: () => void;
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const GITHUB_CONFIG_KEY = 'cv_builder:githubConfig';

function loadConfig(): GitHubConfig {
  try {
    const raw = localStorage.getItem(GITHUB_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { token: '', owner: '', repo: 'my-cv-backup' };
}

function saveConfig(cfg: GitHubConfig) {
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(cfg));
}

async function githubRequest(method: string, path: string, token: string, body?: object): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function upsertFile(token: string, owner: string, repo: string, path: string, content: string, message: string): Promise<void> {
  let sha: string | undefined;
  try {
    const existing = await githubRequest('GET', `/repos/${owner}/${repo}/contents/${path}`, token);
    sha = existing.sha;
  } catch {}

  const encoded = btoa(unescape(encodeURIComponent(content)));
  await githubRequest('PUT', `/repos/${owner}/${repo}/contents/${path}`, token, {
    message,
    content: encoded,
    ...(sha ? { sha } : {}),
  });
}

async function ensureRepoExists(token: string, owner: string, repo: string): Promise<void> {
  try {
    await githubRequest('GET', `/repos/${owner}/${repo}`, token);
  } catch {
    await githubRequest('POST', '/user/repos', token, {
      name: repo,
      description: 'CV backups — created by AI CV Builder',
      private: true,
      auto_init: true,
    });
    await new Promise(r => setTimeout(r, 1500));
  }
}

const GitHubSyncModal: React.FC<GitHubSyncModalProps> = ({ savedCVs, currentCV, personalInfo, onClose }) => {
  const [config, setConfig] = useState<GitHubConfig>(loadConfig);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [lastSynced, setLastSynced] = useState<string | null>(localStorage.getItem('cv_builder:githubLastSync'));
  const [step, setStep] = useState<'config' | 'sync'>(config.token ? 'sync' : 'config');

  const updateConfig = (field: keyof GitHubConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const saveAndContinue = () => {
    if (!config.token.trim() || !config.owner.trim() || !config.repo.trim()) return;
    saveConfig(config);
    setStep('sync');
  };

  const performSync = useCallback(async () => {
    if (!config.token || !config.owner || !config.repo) return;
    setStatus('syncing');
    setMessage('Connecting to GitHub...');

    try {
      await ensureRepoExists(config.token, config.owner, config.repo);
      setMessage('Uploading CVs...');

      const now = new Date().toISOString();
      const allCVs = [...savedCVs];

      if (currentCV && personalInfo) {
        allCVs.unshift({
          id: 'current',
          name: `Current CV (${new Date().toLocaleDateString()})`,
          createdAt: now,
          data: currentCV,
          purpose: 'job',
        } as SavedCV);
      }

      for (const cv of allCVs) {
        const safeName = cv.name.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
        const filePath = `cvs/${safeName}.json`;
        await upsertFile(
          config.token,
          config.owner,
          config.repo,
          filePath,
          JSON.stringify({ ...cv, exportedAt: now }, null, 2),
          `sync: update ${cv.name}`
        );
      }

      const index = {
        lastSynced: now,
        totalCVs: allCVs.length,
        cvList: allCVs.map(cv => ({ id: cv.id, name: cv.name, purpose: cv.purpose, createdAt: cv.createdAt })),
      };
      await upsertFile(config.token, config.owner, config.repo, 'index.json', JSON.stringify(index, null, 2), 'sync: update index');

      localStorage.setItem('cv_builder:githubLastSync', now);
      setLastSynced(now);
      setStatus('success');
      setMessage(`Successfully synced ${allCVs.length} CV${allCVs.length === 1 ? '' : 's'} to ${config.owner}/${config.repo}`);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Sync failed. Check your token and try again.');
    }
  }, [config, savedCVs, currentCV, personalInfo]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-zinc-200 dark:border-neutral-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 dark:bg-zinc-50 rounded-xl flex items-center justify-center text-xl">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white dark:text-zinc-900" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">GitHub Sync</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Back up your CVs to a repository</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl leading-none ml-4">✕</button>
        </div>

        {step === 'config' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">You need a GitHub Personal Access Token</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Generate new token (classic). Required scopes: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">repo</code>.
              </p>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=CV+Builder+Sync"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-xs text-amber-700 dark:text-amber-300 font-semibold underline"
              >
                Create token on GitHub →
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1 block">Personal Access Token</label>
                <input
                  type="password"
                  value={config.token}
                  onChange={e => updateConfig('token', e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2.5 text-sm border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1 block">GitHub Username</label>
                <input
                  type="text"
                  value={config.owner}
                  onChange={e => updateConfig('owner', e.target.value)}
                  placeholder="your-github-username"
                  className="w-full px-3 py-2.5 text-sm border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1 block">Repository Name</label>
                <input
                  type="text"
                  value={config.repo}
                  onChange={e => updateConfig('repo', e.target.value)}
                  placeholder="my-cv-backup"
                  className="w-full px-3 py-2.5 text-sm border border-zinc-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">The repo will be created automatically if it doesn't exist (as private).</p>
              </div>
            </div>

            <button
              onClick={saveAndContinue}
              disabled={!config.token.trim() || !config.owner.trim() || !config.repo.trim()}
              className="w-full py-3 px-4 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-semibold rounded-xl transition-colors hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save & Continue
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-neutral-800 border border-zinc-200 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {config.owner}/{config.repo}
                  </p>
                  {lastSynced && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Last synced: {new Date(lastSynced).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setStep('config')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                >
                  Change
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">What will be synced:</p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 mt-2 space-y-1">
                <li>• {savedCVs.length} saved CV{savedCVs.length !== 1 ? 's' : ''}</li>
                {currentCV && <li>• Current working CV</li>}
                <li>• Stored as JSON files in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">cvs/</code> folder</li>
                <li>• Index file for easy browsing</li>
              </ul>
            </div>

            {status === 'success' && (
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-start gap-3">
                <span className="text-green-600 dark:text-green-400 text-lg">✓</span>
                <p className="text-sm text-green-800 dark:text-green-200">{message}</p>
              </div>
            )}

            {status === 'error' && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                <span className="text-red-600 dark:text-red-400 text-lg">✕</span>
                <p className="text-sm text-red-800 dark:text-red-200">{message}</p>
              </div>
            )}

            {status === 'syncing' && (
              <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-sm text-indigo-800 dark:text-indigo-200">{message}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={performSync}
                disabled={status === 'syncing'}
                className="flex-1 py-3 px-4 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 font-semibold rounded-xl transition-colors hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'syncing' ? (
                  <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Syncing...</>
                ) : (
                  <>↑ Sync to GitHub</>
                )}
              </button>
              {status === 'success' && (
                <a
                  href={`https://github.com/${config.owner}/${config.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 bg-zinc-100 dark:bg-neutral-800 text-zinc-700 dark:text-zinc-300 font-semibold rounded-xl transition-colors hover:bg-zinc-200 dark:hover:bg-neutral-700 text-sm"
                >
                  View Repo
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubSyncModal;
