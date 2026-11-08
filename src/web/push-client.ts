import type { Actor } from '../shared/model.js';
import type { PushStatus, PublicPushDevice } from '../shared/push.js';
import { api } from './client.js';
import { esc } from './ui.js';
let status: PushStatus = { configured: false, publicKey: '', devices: [] };
let current: PublicPushDevice | undefined;
let registration: ServiceWorkerRegistration | undefined;
let loaded = false, problem = '', owner = '';
const supported = () => isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const timeout = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Notification setup timed out. Refresh and try again.')), 12000);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
});
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
function applicationKey(key: string): Uint8Array<ArrayBuffer> {
    const raw = atob(key.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - key.length % 4) % 4));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function iosHomeScreenNeeded(): boolean {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && !matchMedia('(display-mode: standalone)').matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
}
export async function refreshPush(actor: Actor | null): Promise<void> {
    try {
        if (!actor || actor.role !== 'student') {
            status = { ...await api<{ configured: boolean; publicKey: string }>('/api/push/config'), devices: [] };
            owner = ''; current = undefined; loaded = true; return;
        }
        const previousOwner = owner;
        status = await api<PushStatus>('/api/push/status'); owner = actor.id; loaded = true; current = undefined;
        if (supported()) {
            registration = await navigator.serviceWorker.getRegistration('/');
            const sub = await registration?.pushManager.getSubscription();
            if (sub) {
                const id = await digest(sub.endpoint); current = status.devices.find(d => d.id === id);
                // Reattach existing consent after a new login so server-side logout revokes this session's browser.
                // Never create a new subscription silently or revive a removed device.
                if(current && previousOwner !== actor.id && Notification.permission === 'granted') {
                    await api('/api/push/subscribe', 'POST', {subscription: sub.toJSON(), label: current.label});
                }
            }
        }
        problem = '';
    } catch { problem = 'Could not refresh notification settings. Your inbox is still available.'; }
}
export function pushFingerprint(): string { return JSON.stringify({ status, current: current?.id, loaded, problem, permission: 'Notification' in window ? Notification.permission : 'unsupported' }); }
export function pushPanel(): string {
    const canUse = supported(), permission = 'Notification' in window ? Notification.permission : 'default';
    const enabled = !!current && permission === 'granted';
    const heading = enabled ? 'Push enabled on this browser' : 'Get updates after you close the tab';
    let explanation = 'Ready, delay and collection reminders can reach this device while the BreakBite tab is closed. Notifications contain no pickup codes or private meal details.';
    if (!loaded) explanation = 'Checking notification settings…';
    else if (!status.configured) explanation = 'Background push is not configured on this installation yet. The operator must create private push keys and enable PUSH_ENABLED. Your inbox continues to work.';
    else if (!isSecureContext) explanation = 'Open the HTTPS version of BreakBite to enable push. Plain HTTP on a phone or local-network IP is not supported.';
    else if (iosHomeScreenNeeded()) explanation = 'On iPhone or iPad, use Add to Home Screen, open BreakBite from that icon, then enable notifications here.';
    else if (!canUse) explanation = 'This browser does not support Web Push. Use a supported browser; all updates remain in your inbox.';
    else if (permission === 'denied') explanation = 'Notifications are blocked for this site. Allow them in your browser or device settings, then return here.';
    const canEnable = loaded && status.configured && canUse && !iosHomeScreenNeeded() && permission !== 'denied';
    return `<section class="bb-panel bb-push-panel" aria-labelledby="push-title"><p class="bb-kicker">DEVICE NOTIFICATIONS</p><h2 id="push-title">${heading}</h2><p>${esc(explanation)}</p><div class="bb-actions">${!enabled ? `<button class="bb-button primary" data-action="push-enable" ${canEnable ? '' : 'disabled'}>Enable push notifications</button>` : `<button class="bb-button primary" data-action="push-test">Send test notification</button><button class="bb-button secondary" data-action="push-disable" data-id="${esc(current!.id)}">Disable on this browser</button>`}<button class="bb-text-button" data-action="push-refresh">Refresh settings</button></div>${!enabled && current ? `<button class="bb-text-button" data-action="push-disable" data-id="${esc(current.id)}">Remove saved subscription</button>` : ''}${problem ? `<p class="bb-error" role="status">${esc(problem)}</p>` : ''}${current?.lastError ? `<p class="bb-error">${esc(current.lastError)} Updates remain in Inbox.</p>` : ''}${current?.lastAcceptedAt ? `<p class="bb-small">Last accepted by the push service: ${esc(new Date(current.lastAcceptedAt).toLocaleString())}. This is not a device-delivery receipt.</p>` : ''}<p class="bb-small">Opt-in per device. Signing out disables this browser’s account subscription. Push depends on your network, browser and OS settings; it is not SMS or email.</p>${status.devices.filter(d => d.id !== current?.id).length ? `<details><summary>Other subscribed browsers</summary>${status.devices.filter(d => d.id !== current?.id).map(d => `<div class="bb-actions"><span>${esc(d.label)}</span><button class="bb-text-button" data-action="push-disable" data-id="${esc(d.id)}">Remove device</button></div>`).join('')}</details>` : ''}</section>`;
}
/** Called directly from the user's click; permission request precedes any awaited operation. */
export async function pushAction(action: string, id: string | undefined, actor: Actor | null): Promise<string> {
    if (!actor || actor.role !== 'student') throw new Error('Sign in with a student account first.');
    if (action === 'push-refresh') { await refreshPush(actor); return 'Notification settings refreshed.'; }
    if (action === 'push-enable') {
        if (!status.configured || !supported() || iosHomeScreenNeeded()) throw new Error('Use a supported HTTPS browser and follow the instructions in Inbox.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Permission was not granted. Order updates will still appear in Inbox.');
        await timeout(navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }));
        registration = await timeout(navigator.serviceWorker.ready);
        let sub = await registration.pushManager.getSubscription();
        const key = applicationKey(status.publicKey);
        // A changed server key or another account's stale browser subscription needs a fresh endpoint.
        if (sub) {
            const subId = await digest(sub.endpoint), existingKey = sub.options.applicationServerKey;
            const keyMatches = !!existingKey && new Uint8Array(existingKey).every((v, i) => v === key[i]) && existingKey.byteLength === key.length;
            if (!status.devices.some(d => d.id === subId) || !keyMatches || owner !== actor.id) { await sub.unsubscribe(); sub = null; }
        }
        const created = !sub;
        sub ??= await timeout(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        try { await api('/api/push/subscribe', 'POST', { subscription: sub.toJSON(), label: /Android/.test(navigator.userAgent) ? 'Android browser' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone / iPad' : 'Web browser' }); }
        catch (e) { if (created) await sub.unsubscribe().catch(() => false); throw e; }
        await refreshPush(actor); return 'Background push enabled. Send a test, then close the tab and check this device.';
    }
    if (action === 'push-disable') {
        if (!id) throw new Error('Choose a notification device.');
        await api('/api/push/unsubscribe', 'POST', { id });
        if (id === current?.id) await detachPush();
        await refreshPush(actor); return 'Device notification subscription removed.';
    }
    if (action === 'push-test') {
        if (!current) throw new Error('Enable push on this browser first.');
        await api('/api/push/test', 'POST', { id: current.id });
        return 'Test queued for background delivery. A push-service acceptance does not guarantee OS display.';
    }
    throw new Error('Unknown notification action.');
}
export async function detachPush(): Promise<void> {
    if (supported()) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        for (const n of await reg?.getNotifications() ?? []) n.close();
    }
    current = undefined; status.devices = []; owner = '';
}
