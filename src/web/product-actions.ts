import type { ViewState } from './state.js';
import type { PublicOrder, RecoveryOption, Slot } from '../shared/model.js';
import { api } from './client.js';
import { fromLocal } from './ui.js';
interface Hooks { work(fn: () => Promise<void>): Promise<void>; render(): void; refresh(): Promise<void>; invalidate(): void; notify(message: string, error?: boolean): void; }
let stream: MediaStream | null = null;
let scanGeneration = 0;
export function stopCamera(): void { scanGeneration++; stream?.getTracks().forEach(t => t.stop()); stream = null; }
async function startCamera(onResult: (text: string) => Promise<void>): Promise<void> {
    stopCamera(); const generation = scanGeneration;
    const message = document.getElementById('scan-message')!;
    const native = (globalThis as unknown as { BarcodeDetector?: { new(options: { formats: string[] }): { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) { message.textContent = 'Camera requires HTTPS or localhost. Use the manual code or USB scanner on this connection.'; return; }
    if (!native || !(await native.getSupportedFormats()).includes('qr_code')) { message.textContent = 'This browser has no built-in QR detector. Use a supported browser, USB QR scanner, or the manual pickup code.'; return; }
    const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    if (generation !== scanGeneration) { media.getTracks().forEach(t => t.stop()); return; }
    stream = media; const video = document.querySelector<HTMLVideoElement>('#pickup-video');
    if (!video) { stopCamera(); return; }
    video.srcObject = media; await video.play(); const detector = new native({ formats: ['qr_code'] });
    message.textContent = 'Point the camera at the student’s order QR. No image is uploaded.';
    const scan = async () => {
        if (generation !== scanGeneration || !document.contains(video)) { stopCamera(); return; }
        try { const results = await detector.detect(video); const found = results.find(x => x.rawValue.startsWith('BB1:')); if (found) { stopCamera(); await onResult(found.rawValue); return; } }
        catch { if (generation === scanGeneration) message.textContent = 'Keep the QR steady and fully visible, or use the manual code.'; }
        if (generation === scanGeneration) setTimeout(() => { void scan(); }, 250);
    };
    void scan();
}
const post = <T = unknown>(route: string, input: unknown = {}) => api<T>(`/api/product/${route}`, 'POST', input);
async function imageData(file: File): Promise<string> {
    if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photograph under 2 MB.');
    const image = await createImageBitmap(file);
    try {
        if (image.width * image.height > 20000000) throw new Error('Resize this photograph to under 20 megapixels.');
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
        // Re-encode on the device, stripping EXIF metadata and limiting image dimensions.
        return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]!;
    } finally { image.close(); }
}
export function productActions(s: ViewState, h: Hooks) {
    async function resolve(payload: string): Promise<void> {
        s.scanResult = await post<PublicOrder>('pickup/resolve', { payload }); s.scanPayload = payload; h.render();
    }
    return {
        click(target: HTMLElement): boolean {
            const action = target.dataset.action; const id = target.dataset.id ?? ''; const vendorId = target.dataset.vendor ?? s.actor?.vendorId ?? '';
            if (action === 'close-product') { stopCamera(); s.scanner = false; s.qr = null; s.detailItem = null; s.scanResult = null; s.scanPayload = ''; h.render(); return true; }
            if (action === 'food-details') { s.detailItem = s.items.find(i => i.id === id) ?? null; h.render(); return true; }
            if (action === 'open-scanner') { s.scanner = true; s.scanResult = null; h.render(); return true; }
            if (action === 'start-camera') { void startCamera(payload => h.work(() => resolve(payload))).catch(e => h.notify(e instanceof Error ? e.message : 'Camera unavailable.', true)); return true; }
            const actions = ['favourite', 'save-usual', 'rename-usual', 'remove-usual', 'reorder', 'qr', 'start-camera', 'read-notices', 'enable-notices', 'delete-class', 'clear-classes', 'use-break', 'help-order', 'move-earlier', 'ask-alternative', 'uncollected', 'correct-no-show', 'remove-photo'];
            if (!action || !actions.includes(action)) return false;
            if (!s.actor) { s.auth = 'login'; h.render(); return true; }
            void h.work(async () => {
                if (['reorder', 'use-break'].includes(action) && s.uncertain) throw new Error('Recover the uncertain checkout before changing your basket or time plan.');
                if (action === 'favourite') { await post('favourite', { itemId: id, saved: !s.profile.favourites.includes(id) }); await h.refresh(); }
                else if (action === 'save-usual') { const name = prompt('Name this usual order:', 'My campus lunch'); if (!name?.trim()) return; await post('usual', { name, lines: s.cart }); await h.refresh(); h.notify('Usual order saved. Pickup times are selected each time.'); }
                else if (action === 'rename-usual') { const name = prompt('New name:', s.profile.usuals.find(u => u.id === id)?.name); if (!name?.trim()) return; await post('usual', { id, name }); await h.refresh(); }
                else if (action === 'remove-usual') { if (!confirm('Remove this saved basket?')) return; await post('usual', { id, remove: true }); await h.refresh(); }
                else if (action === 'reorder') {
                    if (s.cart.length && !confirm('Replace your current basket with this repeat order?')) return;
                    const result = await post<{ basket: ViewState['cart']; warnings: string[] }>('reorder', target.dataset.usual ? { usualId: target.dataset.usual } : { checkoutId: id });
                    s.cart = result.basket; s.basketMessages = result.warnings; h.invalidate(); s.view = 'explore'; h.notify('Basket rebuilt. Review current details and choose new pickup times.');
                } else if (action === 'qr') {
                    const result = await post<{ payload: string }>('pickup/qr', { vendorId, orderId: id }); const o = s.snapshot?.orders.find(o => o.id === id);
                    s.qr = { payload: result.payload, code: o?.pickupCode ?? '', kitchen: s.vendors.find(v => v.id === vendorId)?.name ?? '' };
                } 
                else if (action === 'read-notices') { await post('notices/read'); await h.refresh(); }
                else if (action === 'enable-notices') {
                    if (!('Notification' in window) || !isSecureContext) throw new Error('Device notifications are unavailable here. Your account inbox still receives reminders.');
                    const permission = await Notification.requestPermission(); h.notify(permission === 'granted' ? 'Device notices enabled while the website is open. Closed-browser push is not configured.' : 'Device notices are off. Use your account inbox.');
                } else if (action === 'delete-class') { await post('timetable/delete', { id }); await h.refresh(); }
                else if (action === 'clear-classes') { if (!confirm('Delete all saved classes and the pending import preview?')) return; await post('timetable/delete', { all: true }); await h.refresh(); }
                else if (action === 'use-break') { s.fitBreak = true; s.plan.breakStartAt = target.dataset.start!; s.plan.nextClassAt = target.dataset.end!; h.invalidate(); s.view = 'explore'; h.notify('Break applied. Review walking/eating times and live pickup availability.'); }
                else if (action === 'help-order') {
                    s.earlier[id] = await post<{ slots: Slot[]; message: string }>('earlier/options', { vendorId, orderId: id });
                    s.recovery[id] = await post<{ options: RecoveryOption[]; message: string }>('assistance', { vendorId, orderId: id }); await h.refresh();
                } else if (action === 'move-earlier') { if (!confirm('Move only this kitchen order to the selected earlier slot? No other student’s order is moved.')) return; await post('earlier/confirm', { vendorId, orderId: id, slotId: target.dataset.slot }); delete s.earlier[id]; delete s.recovery[id]; await h.refresh(); h.notify('Earlier slot reserved. Use your refreshed pickup code.'); }
                else if (action === 'ask-alternative') {
                    const option = s.recovery[id]?.options[Number(target.dataset.index)]; if (!option) throw new Error('Check alternatives again.');
                    await api(`/api/vendors/${encodeURIComponent(vendorId)}/proposals`, 'POST', { orderId: id, itemId: option.itemId, slotId: option.slotId, reason: 'Student requested a faster option. Kitchen approval and student final confirmation are required.' }); await h.refresh(); h.notify('Alternative requested. Your original order stays in place until approved and accepted.');
                } else if (action === 'uncollected') { const reason = prompt('Confirm the student did not collect. Enter a note; prepared food will NOT be restocked:'); if (!reason?.trim()) return; await post('uncollected', { orderId: id, reason }); await h.refresh(); }
                else if (action === 'correct-no-show') { const reason = prompt('Why should this no-show record be corrected?'); if (!reason?.trim()) return; await post('no-show/correct', { orderId: id, reason }); await h.refresh(); h.notify('No-show record corrected. No automatic penalty was imposed.'); }
                else if (action === 'remove-photo') { await post('photo', { itemId: id, remove: true }); await h.refresh(); if (s.editing && s.editing !== 'new') s.editing = s.items.find(i => i.id === id)!; }
            }); return true;
        },
        submit(form: HTMLFormElement): boolean {
            if (!['diet-form', 'class-form', 'ics-form', 'confirm-ics-form', 'scanner-input', 'scan-confirm', 'photo-form'].includes(form.id)) return false;
            const f = new FormData(form);
            void h.work(async () => {
                if (form.id === 'diet-form') { await post('preferences', { diets: f.getAll('diets'), avoid: f.getAll('avoid'), hideUnsuitable: f.get('hideUnsuitable') === 'on' }); await h.refresh(); if (!s.uncertain) h.invalidate(); h.notify('Preferences saved. Unknown or conflicting information will not pass active restrictions.'); }
                else if (form.id === 'class-form') { await post('timetable/manual', { title: f.get('title'), location: f.get('location'), startAt: fromLocal(f.get('startAt')), endAt: fromLocal(f.get('endAt')), weeks: Number(f.get('weeks')) }); await h.refresh(); h.notify('Class saved.'); }
                else if (form.id === 'ics-form') { const file = f.get('calendar') as File; if (!file || file.size > 262144) throw new Error('Choose an .ics file under 256 KB.'); await post('timetable/preview', { content: await file.text() }); await h.refresh(); h.notify('Preview ready. Check warnings and class times before confirming.'); }
                else if (form.id === 'confirm-ics-form') { await post('timetable/confirm', { previewId: f.get('previewId'), ids: f.getAll('classId'), replaceImported: f.get('replaceImported') === 'on' }); await h.refresh(); h.notify('Selected classes imported. This is a snapshot, not live synchronisation.'); }
                else if (form.id === 'scanner-input') { stopCamera(); await resolve(String(f.get('payload'))); }
                else if (form.id === 'scan-confirm') { await post('pickup/collect', { payload: s.scanPayload, paymentReceived: f.get('paid') === 'on' }); stopCamera(); s.scanResult = null; s.scanPayload = ''; s.scanner = false; await h.refresh(); h.notify('Payment confirmed and pickup completed. This QR cannot be used again.'); }
                else if (form.id === 'photo-form') { const file = f.get('photo') as File; if (!(file instanceof File) || !file.size) throw new Error('Choose a photograph.'); const data = await imageData(file); const id = String(f.get('itemId')); await post('photo', { itemId: id, data, credit: f.get('credit'), permission: f.get('permission') === 'on' }); await h.refresh(); s.editing = s.items.find(i => i.id === id)!; h.notify('Photo saved with attribution.'); }
            }); return true;
        },
    };
}
