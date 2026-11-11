import { requireThat } from './errors.js';
import { ALL_VENDOR_IDS } from './seed.js';
export interface Settings {
    vercel: boolean;
    mode: 'demo' | 'firebase' | 'local';
    secureCookie: boolean;
    host: string;
    port: number;
    dataDir: string;
    projectId: string;
    firebaseApiKey: string;
    allowedOrigins: string[];
    vendorUsers: Record<string, string>;
    agentEmails: Record<string, string>;
    trustCloudRunIAM: boolean;
    agentAudience: string;
    demoAgentToken: string;
    mcpOnly: boolean;
    cloud: boolean;
    accessToken: string;
    store: 'file' | 'firestore';
    firestoreDatabase: string;
    firestoreRoot: string;
    firestoreRefreshMs: number;
}
function mapping(value: string | undefined, label: string): Record<string, string> {
    if (!value)
        return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error(`${label} must be a JSON object.`);
    }
    requireThat(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'CONFIG', `${label} must be an object.`, 500);
    for (const [key, id] of Object.entries(parsed))
        requireThat(key.length > 0 && typeof id === 'string' && ALL_VENDOR_IDS.includes(id as typeof ALL_VENDOR_IDS[number]), 'CONFIG', `${label} contains an invalid vendor mapping.`, 500);
    return parsed as Record<string, string>;
}
export function settings(env: NodeJS.ProcessEnv = process.env): Settings {
    const vercel = env.VERCEL === '1';
    const mode = env.AUTH_MODE ?? 'local';
    requireThat(mode === 'local' || mode === 'demo' || mode === 'firebase', 'CONFIG', 'AUTH_MODE must be local, demo or firebase.', 500);
    const cloud = vercel || !!env.K_SERVICE || env.STORE === 'firestore';
    requireThat(!(cloud && mode === 'demo'), 'CONFIG', 'Cloud execution requires AUTH_MODE=local or firebase. Public demo impersonation is disabled.', 500);
    requireThat(env.STORE === undefined || ['file', 'firestore'].includes(env.STORE), 'CONFIG', 'STORE must be file or firestore.', 500);
    const store = env.STORE === 'firestore' || (vercel && !env.STORE) ? 'firestore' : 'file';
    requireThat(!((env.K_SERVICE || vercel) && mode === 'local' && store === 'file'), 'CONFIG', 'Hosting disks are temporary. Use STORE=firestore so accounts and orders are not lost.', 500);
    requireThat(!vercel || mode === 'local', 'CONFIG', 'Vercel requires AUTH_MODE=local for the product accounts.', 500);
    const firestoreDatabase = env.FIRESTORE_DATABASE || '(default)';
    requireThat(firestoreDatabase === '(default)' || /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(firestoreDatabase), 'CONFIG', 'FIRESTORE_DATABASE must be (default) or a valid database ID.', 500);
    const firestoreRoot = env.FIRESTORE_ROOT || 'envs/production';
    requireThat(!vercel || env.VERCEL_ENV !== 'preview' || (env.FIRESTORE_ROOT && firestoreRoot !== 'envs/production'), 'CONFIG', 'Preview deployments need a separate FIRESTORE_ROOT; never use production data in previews.', 500);
    const rootSegments = firestoreRoot.split('/');
    requireThat(rootSegments.length >= 2 && rootSegments.length % 2 === 0 && rootSegments.every(s => /^[A-Za-z0-9_-]{1,100}$/.test(s)), 'CONFIG', 'FIRESTORE_ROOT must be a document path such as envs/production.', 500);
    const firestoreRefreshMs = Number(env.FIRESTORE_REFRESH_MS ?? 5000);
    requireThat(Number.isInteger(firestoreRefreshMs) && firestoreRefreshMs >= 0, 'CONFIG', 'FIRESTORE_REFRESH_MS must be a whole number of milliseconds (0 turns checking off).', 500);
    const port = Number(env.PORT ?? 8080);
    requireThat(Number.isInteger(port) && port > 0 && port <= 65535, 'CONFIG', 'Invalid PORT.', 500);
    const origins = (env.ALLOWED_ORIGINS ?? (vercel ? '' : `http://localhost:${port},http://127.0.0.1:${port}`)).split(',').map(x => x.trim()).filter(Boolean);
    if (vercel) for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, ...(env.VERCEL_ENV === 'production' ? [env.VERCEL_PROJECT_PRODUCTION_URL] : [])]) {
        if (host) { requireThat(/^[a-zA-Z0-9.-]+$/.test(host), 'CONFIG', 'Invalid Vercel deployment hostname.', 500); origins.push(`https://${host}`); }
    }
    for (const origin of origins) {
        const url = new URL(origin);
        requireThat(url.origin === origin && (vercel ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)), 'CONFIG', 'Use exact origins without trailing slashes; Vercel requires HTTPS.', 500);
    }
    const config: Settings = {
        vercel, mode, secureCookie: env.COOKIE_SECURE === 'true' || (vercel && env.COOKIE_SECURE === undefined), host: env.HOST ?? (env.K_SERVICE ? '0.0.0.0' : '127.0.0.1'), port, cloud,
        dataDir: env.DATA_DIR ?? '.data', projectId: env.GOOGLE_CLOUD_PROJECT ?? '', firebaseApiKey: env.FIREBASE_API_KEY ?? '',
        allowedOrigins: origins, vendorUsers: mapping(env.VENDOR_USERS_JSON, 'VENDOR_USERS_JSON'),
        agentEmails: mapping(env.MCP_EMAILS_JSON, 'MCP_EMAILS_JSON'), trustCloudRunIAM: env.MCP_TRUST_CLOUD_RUN_IAM === 'true',
        agentAudience: env.MCP_AUDIENCE ?? '',
        demoAgentToken: env.DEMO_MCP_TOKEN ?? '', mcpOnly: env.MCP_ONLY === 'true', accessToken: env.FIRESTORE_ACCESS_TOKEN ?? '',
        store, firestoreDatabase, firestoreRoot, firestoreRefreshMs,
    };
    requireThat(!vercel || (config.secureCookie && origins.length > 0 && config.firestoreRefreshMs > 0), 'CONFIG', 'Vercel requires secure cookies, an HTTPS origin and enabled Firestore refresh.', 500);
    requireThat(mode !== 'firebase' || !!config.projectId, 'CONFIG', 'Firebase mode requires GOOGLE_CLOUD_PROJECT.', 500);
    requireThat(!(mode === 'local' && store === 'firestore') || /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId), 'CONFIG', 'STORE=firestore requires GOOGLE_CLOUD_PROJECT (your Google Cloud project ID).', 500);
    requireThat(mode !== 'demo' || ['127.0.0.1', 'localhost', '::1'].includes(config.host), 'CONFIG', 'Demo mode binds only to loopback; do not expose role switching publicly.', 500);
    requireThat(!config.trustCloudRunIAM || (mode === 'firebase' && !!env.K_SERVICE && config.mcpOnly), 'CONFIG', 'MCP_TRUST_CLOUD_RUN_IAM requires a private MCP-only Cloud Run deployment.', 500);
    if (mode === 'local' && !['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
        requireThat(config.allowedOrigins.length > 0 && (config.secureCookie || env.ALLOW_INSECURE_LAN === 'true'), 'CONFIG', 'For non-loopback use HTTPS and COOKIE_SECURE=true. Isolated LAN testing requires explicit ALLOW_INSECURE_LAN=true.', 500);
        requireThat(!!env.ALLOWED_ORIGINS, 'CONFIG', 'List exact ALLOWED_ORIGINS for phone/LAN access.', 500);
    }
    return config;
}
