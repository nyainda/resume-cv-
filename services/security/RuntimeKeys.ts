/**
 * RuntimeKeys — in-memory decrypted key store.
 *
 * After KeyVault decrypts API keys from storage, the plaintext lives HERE —
 * in a module-level variable — and is never written back to any persistent
 * store.  Services that need a key import `getRuntimeKey()` instead of
 * reading directly from localStorage.
 *
 * The store is cleared on every page load (module re-initialisation), so
 * keys must always be decrypted fresh from the encrypted storage on startup.
 */

interface RuntimeKeyStore {
    gemini:     string | null;
    groq:       string | null;
    cerebras:   string | null;
    openrouter: string | null;
    together:   string | null;
    claude:     string | null;
    tavily:     string | null;
    brevo:      string | null;
    jsearch:    string | null;
}

let _store: RuntimeKeyStore = {
    gemini:     null,
    groq:       null,
    cerebras:   null,
    openrouter: null,
    together:   null,
    claude:     null,
    tavily:     null,
    brevo:      null,
    jsearch:    null,
};

/**
 * Populate the cache from a decrypted ApiSettings object.
 * Called by App.tsx after KeyVault.decryptApiSettings().
 */
export function setRuntimeKeys(settings: {
    apiKey?:           string | null;
    groqApiKey?:       string | null;
    cerebrasApiKey?:   string | null;
    openrouterApiKey?: string | null;
    togetherApiKey?:   string | null;
    claudeApiKey?:     string | null;
    tavilyApiKey?:     string | null;
    brevoApiKey?:      string | null;
    jsearchApiKey?:    string | null;
}): void {
    _store = {
        gemini:     settings.apiKey            ?? null,
        groq:       settings.groqApiKey        ?? null,
        cerebras:   settings.cerebrasApiKey    ?? null,
        openrouter: settings.openrouterApiKey  ?? null,
        together:   settings.togetherApiKey    ?? null,
        claude:     settings.claudeApiKey      ?? null,
        tavily:     settings.tavilyApiKey      ?? null,
        brevo:      settings.brevoApiKey       ?? null,
        jsearch:    settings.jsearchApiKey     ?? null,
    };
}

/** Clear all cached keys (e.g. on sign-out). */
export function clearRuntimeKeys(): void {
    _store = {
        gemini: null, groq: null, cerebras: null, openrouter: null, together: null,
        claude: null, tavily: null, brevo: null, jsearch: null,
    };
}

export function getGroqKey(): string | null       { return _store.groq; }
export function getGeminiKey(): string | null     { return _store.gemini; }
export function getCerebrasKey(): string | null   { return _store.cerebras; }
export function getOpenRouterKey(): string | null { return _store.openrouter; }
export function getTogetherKey(): string | null   { return _store.together; }
export function getClaudeKey(): string | null     { return _store.claude; }
export function getTavilyKey(): string | null     { return _store.tavily; }
export function getBrevoKey(): string | null      { return _store.brevo; }
export function getJSearchKey(): string | null    { return _store.jsearch; }

/** True if at least one AI key (any provider) is loaded. */
export function hasAiKey(): boolean {
    return !!(_store.groq || _store.cerebras || _store.openrouter || _store.together || _store.gemini);
}
