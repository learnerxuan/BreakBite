import type { FoodInfo, FoodPreferences, PickupPolicy } from './features.js';
export type Role = 'student' | 'vendor' | 'agent';
export interface Actor {
    id: string;
    role: Role;
    name: string;
    vendorId?: string;
}
export interface Vendor {
    id: string;
    name: string;
    description: string;
    location: string;
    open: boolean;
    synthetic: boolean;
    campus?: string; menuReviewedAt?: string; menuSource?: string;
    policies?: PickupPolicy;
    onlineKitchenCapacity?: number;
    onlinePickupCapacity?: number;
}
export interface MenuItem {
    id: string;
    vendorId: string;
    name: string;
    description: string;
    category: 'Rice' | 'Noodles' | 'Light bites' | 'Drinks';
    priceSen: number;
    stock: number;
    prepMinutes: number;
    prepUnits: number;
    enabled: boolean;
    art: 'rice' | 'noodles' | 'toast' | 'salad' | 'drink';
    foodInfo?: FoodInfo; photoPath?: string; photoCredit?: string;
    tags: string[];
    allergens: string[] | null;
}
export interface Slot {
    id: string;
    startAt: string;
    endAt: string;
    kitchenCapacity: number;
    reservedUnits: number;
    pickupCapacity: number;
    reservedHandovers: number;
}
export interface BreakPlan {
    breakStartAt: string;
    nextClassAt: string;
    walkToMinutes: number;
    eatMinutes: number;
    returnMinutes: number;
    bufferMinutes: number;
    budgetSen: number;
}
export interface PickupPlan { mode: 'pickup'; budgetSen: number; }
export type MealPlan = BreakPlan | PickupPlan;
export interface Selection {
    itemId: string;
    quantity: number;
}
export interface OrderLine extends Selection {
    name: string;
    unitPriceSen: number;
    prepUnits: number;
    foodInfo?: FoodInfo;
}
export type OrderStatus = 'confirmed' | 'preparing' | 'ready' | 'collected' | 'cancelled' | 'uncollected';
export interface Order {
    id: string;
    studentId: string;
    vendorId: string;
    lines: OrderLine[];
    totalSen: number;
    slotId: string;
    plan: MealPlan;
    checkoutId?: string;
    latestPickupAt: string;
    earliestPickupAt: string;
    estimatedReadyAt: string;
    status: OrderStatus;
    version: number;
    pickupCode: string;
    qrToken?: string;
    readyAt?: string; collectionDueAt?: string; overdueAt?: string;
    promisedPickupEndAt?: string; cancelBeforeAt?: string; policy?: PickupPolicy;
    assistanceRequested?: boolean; dietary?: FoodPreferences; vendorDelayed?: boolean; closedReason?: string;
    noShowRecorded?: boolean;
    createdAt: string;
    updatedAt: string;
    collectionFailures: number;
    collectionLockedUntil: string | null;
    payment: 'simulated' | 'pay_at_pickup';
    paymentStatus?: 'unpaid' | 'paid';
    paidAt?: string;
}
export interface Incident {
    id: string;
    itemIds: string[];
    reason: string;
    delayMinutes: number;
    active: boolean;
    createdAt: string;
}
export interface RecoveryOption {
    foodInfo?: FoodInfo;
    foodRevision?: string;
    itemId: string;
    itemName: string;
    quantity: number;
    totalSen: number;
    slotId: string;
    readyAt: string;
    allergens: string[] | null;
}
export type ProposalStatus = 'pending_vendor' | 'approved' | 'accepted' | 'declined' | 'rejected' | 'expired' | 'stale';
export interface Proposal {
    id: string;
    orderId: string;
    orderVersion: number;
    studentId: string;
    vendorId: string;
    option: RecoveryOption;
    reason: string;
    status: ProposalStatus;
    createdAt: string;
    expiresAt: string;
    source: 'manual' | 'mcp' | 'student';
}
export interface AuditEvent {
    id: string;
    at: string;
    actorId: string;
    action: string;
    subjectId: string;
    detail: string;
}
export interface VendorState {
    schemaVersion: 1;
    revision: number;
    vendor: Vendor;
    items: MenuItem[];
    slots: Slot[];
    orders: Order[];
    incidents: Incident[];
    proposals: Proposal[];
    audit: AuditEvent[];
    requests: Record<string, {
        fingerprint: string;
        orderId: string;
        createdAt: string;
    }>;
}
export interface Quote {
    vendorId: string;
    totalSen: number;
    earliestPickupAt: string;
    latestPickupAt: string;
    slots: Slot[];
    reasons: string[];
}
export type PublicOrder = Omit<Order, 'pickupCode' | 'qrToken' | 'collectionFailures' | 'collectionLockedUntil'> & {
    pickupCode?: string;
};
export interface Snapshot {
    actor: Actor;
    vendors: Vendor[];
    items: MenuItem[];
    slots: (Slot & {
        vendorId: string;
    })[];
    orders: PublicOrder[];
    proposals: Proposal[];
    incidents: Incident[];
    audit: AuditEvent[];
    serverTime: string;
    mode: 'demo' | 'firebase' | 'local';
}
export interface AppConfig {
    mode: 'demo' | 'firebase' | 'local';
    firebaseApiKey: string;
    enterpriseConfigured: boolean;
    apspaceConfigured?: boolean;
    demoIdentities: Actor[];
}

export interface ApspaceSelection { intake: string; group: string; }
export interface ApspaceSource extends ApspaceSelection {
    sourceRevision: string;
    firstDate: string;
    lastDate: string;
    coveredDates: string[];
    publishedAt?: string;
}
export interface ApspaceConnection extends ApspaceSource {
    revision: string;
    lastCheckedAt: string;
    lastSuccessfulAt: string;
    status: 'current' | 'review' | 'unavailable';
}
export const money = (sen: number): string => `RM ${(sen / 100).toFixed(2)}`;
export const time = (iso: string): string => new Intl.DateTimeFormat('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
export const atRisk = (o: Pick<Order, 'estimatedReadyAt' | 'latestPickupAt' | 'status'>): boolean => ['confirmed', 'preparing'].includes(o.status) && o.estimatedReadyAt > o.latestPickupAt;

export interface BasketGroup { vendorId: string; items: Selection[]; slotId?: string; }
export interface BasketQuote { menuVersions?: Record<string, string>; groups: Quote[]; totalSen: number; reasons: string[]; }
export interface CheckoutResult { id: string; orders: PublicOrder[]; totalSen: number; }
export interface TimetableEvent {
    id: string;
    summary: string;
    location: string;
    startAt: string;
    endAt: string;
}

export interface TimetableImport {
    events: TimetableEvent[];
    warnings: string[];
}

export interface TimetableBreak {
    startAt: string;
    endAt: string;
}
