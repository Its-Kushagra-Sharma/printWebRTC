export type PaymentMethod = 'wallet' | 'cash';
export type JobStatus = 'awaiting_payment' | 'awaiting_cash_approval' | 'ready_for_transfer' | 'transferring' | 'received' | 'printing' | 'printed' | 'failed' | 'cancelled';

export interface PrintOptions { copies: number; color: boolean; duplex: boolean; paper: 'A4' | 'A3' | 'Letter'; printer_id?: string }
export interface Pricing { mono_paisa: number; color_paisa: number; duplex_discount_paisa: number; minimum_order_paisa: number }
export interface PrintJob {
  id: string; shop_id: string; customer_uid: string; agent_id: string;
  status: JobStatus; payment_method: PaymentMethod; fee_paisa: number;
  options: PrintOptions; pages: number; mime_type: string; file_name: string;
  byte_length: number; sha256: string; created_at: unknown; expires_at: unknown;
}
export interface TransferMeta { type: 'meta'; jobId: string; fileName: string; mimeType: string; byteLength: number; sha256: string; options: PrintOptions }
export interface TransferComplete { type: 'complete'; jobId: string; sha256: string }

export function quotePaisa(pricing: Pricing, options: PrintOptions, pages: number): number {
  if (!Number.isSafeInteger(pages) || pages < 1 || !Number.isSafeInteger(options.copies) || options.copies < 1) throw new Error('Invalid print quantity');
  const perPage = options.color ? pricing.color_paisa : pricing.mono_paisa;
  const raw = perPage * pages * options.copies;
  const duplexSaving = options.duplex ? pricing.duplex_discount_paisa * pages * options.copies : 0;
  return Math.max(pricing.minimum_order_paisa, raw - duplexSaving);
}

export function paisaToINR(paisa: number): string { return `₹${(paisa / 100).toFixed(2)}`; }

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
