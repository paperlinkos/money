import type { GearData } from './types'
const KEY = 'northstar.gear.v1'; const empty = (): GearData => ({ version: 1, gear: [], checklists: [], listings: [], bookings: [], settings: { owner: '', whatsapp: '', pickup: '', terms: '' } })
const seeded = (): GearData => {
  const camera = 'gear-camera'; const lens = 'gear-lens'; const light = 'gear-light'; const listingCamera = 'listing-camera'; const listingLight = 'listing-light'
  return {
    version: 1,
    settings: { owner: 'Your Studio', whatsapp: '2348012345678', pickup: 'Pickup in Abuja. Delivery can be arranged.', terms: 'A valid ID and refundable security deposit may be required.' },
    gear: [
      { id: camera, name: 'Sony A7 III Camera', category: 'Cameras', brand: 'Sony', model: 'A7 III', quantity: 2, serials: ['A7-001', 'A7-002'], location: 'Main camera case', condition: 'Good', ownership: 'Owned', available: true, notes: '' },
      { id: lens, name: '24–70mm f/2.8 Lens', category: 'Lenses', brand: 'Sigma', model: '24–70mm Art', quantity: 2, serials: [], location: 'Lens pouch', condition: 'Good', ownership: 'Owned', available: true, notes: '' },
      { id: light, name: 'LED Panel Light', category: 'Lighting', brand: 'Godox', model: 'LED1000', quantity: 3, serials: [], location: 'Lighting case', condition: 'Good', ownership: 'Owned', available: true, notes: '' },
      { id: 'gear-mic', name: 'Wireless Microphone Set', category: 'Microphones', brand: 'RØDE', model: 'Wireless GO', quantity: 1, serials: [], location: 'Audio bag', condition: 'Needs Repair', ownership: 'Owned', available: false, notes: 'Left transmitter needs attention.' },
    ],
    checklists: [{ id: 'checklist-wedding', name: 'Weekend Wedding', date: '2026-10-24', location: 'Abuja', client: 'Ada & Tunde', notes: '', items: [{ id: 'item-1', gearId: camera, name: 'Sony A7 III Camera', required: 2, packed: 1, missing: 0, returned: 0, damaged: false, notes: '' }, { id: 'item-2', gearId: light, name: 'LED Panel Light', required: 2, packed: 2, missing: 0, returned: 0, damaged: false, notes: '' }, { id: 'item-3', name: 'Extension cables', required: 2, packed: 0, missing: 0, returned: 0, damaged: false, notes: 'External item' }] }],
    listings: [{ id: listingCamera, gearId: camera, name: 'Sony A7 III Camera', category: 'Cameras', description: 'Reliable full-frame camera body for productions and events.', dailyRate: 25000, weeklyRate: 140000, deposit: 100000, pickup: 'Abuja pickup', terms: 'ID required.', visible: true }, { id: listingLight, gearId: light, name: 'LED Panel Light', category: 'Lighting', description: 'Bright, adjustable LED panel light with stand.', dailyRate: 8500, weeklyRate: 45000, deposit: 25000, pickup: 'Abuja pickup', terms: 'Handle with care.', visible: true }],
    bookings: [{ id: 'booking-demo', listingId: listingCamera, customer: 'River Events', contact: '08012345678', quantity: 1, start: '2026-10-26', end: '2026-10-27', status: 'Enquiry', notes: 'Awaiting confirmation.' }],
  }
}
export function loadGear() { try { const raw = localStorage.getItem(KEY); if (!raw) return seeded(); const value = JSON.parse(raw); return value?.version === 1 && Array.isArray(value.gear) ? value as GearData : empty() } catch { return empty() } }
export function saveGear(data: GearData) { localStorage.setItem(KEY, JSON.stringify(data)); return data }
export function validGear(value: unknown): value is GearData { return Boolean(value && typeof value === 'object' && (value as GearData).version === 1 && Array.isArray((value as GearData).gear) && Array.isArray((value as GearData).checklists) && Array.isArray((value as GearData).listings) && Array.isArray((value as GearData).bookings)) }
const dbName = 'northstar-gear-photos'; const store = 'photos'
function db() { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => request.result.createObjectStore(store); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
export async function savePhoto(file: File) { const key = crypto.randomUUID(); const database = await db(); await new Promise<void>((resolve, reject) => { const tx = database.transaction(store, 'readwrite'); tx.objectStore(store).put(awaitable(file), key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }); return key }
function awaitable(file: File) { return file }
export async function getPhoto(key?: string) { if (!key) return undefined; const database = await db(); return new Promise<string | undefined>((resolve) => { const req = database.transaction(store).objectStore(store).get(key); req.onsuccess = () => resolve(req.result ? URL.createObjectURL(req.result as Blob) : undefined); req.onerror = () => resolve(undefined) }) }
export async function getPhotoData(key?: string) { if (!key) return undefined; const database = await db(); return new Promise<string | undefined>((resolve) => { const req = database.transaction(store).objectStore(store).get(key); req.onsuccess = () => { if (!req.result) return resolve(undefined); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(undefined); reader.readAsDataURL(req.result as Blob) }; req.onerror = () => resolve(undefined) }) }
