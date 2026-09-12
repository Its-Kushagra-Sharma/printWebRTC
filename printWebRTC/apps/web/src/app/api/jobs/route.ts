import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, verifiedUser } from '@/lib/admin';
import { quotePaisa, type PrintOptions, type Pricing } from '@myprint/shared';

export async function POST(request: Request) {
  try {
    const user = await verifiedUser(request);
    const body = await request.json() as { shopId: string; agentId: string; pages: number; options: PrintOptions; paymentMethod: 'wallet' | 'cash'; fileName: string; mimeType: string; byteLength: number; sha256: string };
    if (!body.shopId || !body.agentId || !/^[a-f0-9]{64}$/i.test(body.sha256) || body.byteLength < 1) throw new Error('Invalid job request');
    const result = await adminDb.runTransaction(async (tx) => {
      const shopRef = adminDb.doc(`shops/${body.shopId}`);
      const pricingRef = adminDb.doc(`shops/${body.shopId}/pricing/current`);
      const customerRef = adminDb.doc(`customers/${user.uid}`);
      const [shop, price, customer] = await Promise.all([tx.get(shopRef), tx.get(pricingRef), tx.get(customerRef)]);
      if (!shop.exists || !price.exists) throw new Error('Shop is unavailable');
      const fee = quotePaisa(price.data() as Pricing, body.options, body.pages);
      if (body.paymentMethod === 'wallet' && (customer.data()?.wallet_paisa ?? 0) < fee) throw new Error('Insufficient wallet balance');
      const jobRef = adminDb.collection(`shops/${body.shopId}/jobs`).doc();
      const status = body.paymentMethod === 'cash' ? 'awaiting_cash_approval' : 'ready_for_transfer';
      tx.create(jobRef, { shop_id: body.shopId, customer_uid: user.uid, agent_id: body.agentId, status, payment_method: body.paymentMethod, fee_paisa: fee, options: body.options, pages: body.pages, file_name: body.fileName, mime_type: body.mimeType, byte_length: body.byteLength, sha256: body.sha256, created_at: FieldValue.serverTimestamp(), expires_at: new Date(Date.now() + 20 * 60_000) });
      if (body.paymentMethod === 'wallet') {
        tx.update(customerRef, { wallet_paisa: FieldValue.increment(-fee) });
        tx.create(adminDb.collection(`shops/${body.shopId}/wallet_ledger`).doc(), { customer_uid: user.uid, kind: 'debit_print', amount_paisa: -fee, job_id: jobRef.id, created_at: FieldValue.serverTimestamp() });
      }
      return { id: jobRef.id, fee_paisa: fee, status };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Job creation failed' }, { status: 400 }); }
}
