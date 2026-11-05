import { requireThat } from './errors.js';
export interface Settings {
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
        requireThat(key.length > 0 && typeof id === 'string' && ['bowl-lab', 'noodle-co'].includes(id), 'CONFIG', `${label} contains an invalid vendor mapping.`, 500);
    return parsed as Record<string, string>;
}
export function settings(env: NodeJS.ProcessEnv = process.env): Settings {
    const mode = env.AUTH_MODE ?? 'local';
    requireThat(mode === 'local' || mode === 'demo' || mode === 'firebase', 'CONFIG', 'AUTH_MODE must be local, demo or firebase.', 500);
    const cloud = !!env.K_SERVICE || env.STORE === 'firestore';
    requireThat(!(cloud && mode !== 'firebase'), 'CONFIG', 'Cloud execution requires AUTH_MODE=firebase. Public demo impersonation is disabled.', 500);
    requireThat(env.STORE === undefined || ['file', 'firestore'].includes(env.STORE), 'CONFIG', 'STORE must be file or firestore.', 500);
    const port = Number(env.PORT ?? 8080);
    requireThat(Number.isInteger(port) && port > 0 && port <= 65535, 'CONFIG', 'Invalid PORT.', 500);
    const origins = (env.ALLOWED_ORIGINS ?? `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(x => x.trim()).filter(Boolean);
    for (const origin of origins) {
        const url = new URL(origin);
        requireThat(url.origin === origin && ['http:', 'https:'].includes(url.protocol), 'CONFIG', 'Use exact origins without trailing slashes.', 500);
    }
    const config: Settings = {
        mode, secureCookie: env.COOKIE_SECURE === 'true', host: env.HOST ?? (env.K_SERVICE ? '0.0.0.0' : '127.0.0.1'), port, cloud,
        dataDir: env.DATA_DIR ?? '.data', projectId: env.GOOGLE_CLOUD_PROJECT ?? '', firebaseApiKey: env.FIREBASE_API_KEY ?? '',
        allowedOrigins: origins, vendorUsers: mapping(env.VENDOR_USERS_JSON, 'VENDOR_USERS_JSON'),
        agentEmails: mapping(env.MCP_EMAILS_JSON, 'MCP_EMAILS_JSON'), trustCloudRunIAM: env.MCP_TRUST_CLOUD_RUN_IAM === 'true',
        agentAudience: env.MCP_AUDIENCE ?? '',
        demoAgentToken: env.DEMO_MCP_TOKEN ?? '', mcpOnly: env.MCP_ONLY === 'true', accessToken: env.FIRESTORE_ACCESS_TOKEN ?? '',
    };
    requireThat(mode !== 'firebase' || !!config.projectId, 'CONFIG', 'Firebase mode requires GOOGLE_CLOUD_PROJECT.', 500);
    requireThat(mode !== 'demo' || ['127.0.0.1', 'localhost', '::1'].includes(config.host), 'CONFIG', 'Demo mode binds only to loopback; do not expose role switching publicly.', 500);
    requireThat(!config.trustCloudRunIAM || (mode === 'firebase' && !!env.K_SERVICE && config.mcpOnly), 'CONFIG', 'MCP_TRUST_CLOUD_RUN_IAM requires a private MCP-only Cloud Run deployment.', 500);
    if (mode === 'local' && !['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
        requireThat(config.allowedOrigins.length > 0 && (config.secureCookie || env.ALLOW_INSECURE_LAN === 'true'), 'CONFIG', 'For non-loopback use HTTPS and COOKIE_SECURE=true. Isolated LAN testing requires explicit ALLOW_INSECURE_LAN=true.', 500);
        requireThat(!!env.ALLOWED_ORIGINS, 'CONFIG', 'List exact ALLOWED_ORIGINS for phone/LAN access.', 500);
    }
    return config;
}
