import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';

// Deliberately returns only QR-safe/public fields. Files, wallet balances, and job history never leave protected paths.
export async function GET(_: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const [shop, pricing, agents] = await Promise.all([
    adminDb.doc(`shops/${shopId}`).get(),
    adminDb.doc(`shops/${shopId}/pricing/current`).get(),
    adminDb.collection(`shops/${shopId}/agents`).where('online', '==', true).limit(1).get(),
  ]);
  if (!shop.exists || !shop.data()?.active || !pricing.exists) return NextResponse.json({ error: 'This print shop is unavailable' }, { status: 404 });
  const agent = agents.docs[0];
  if (!agent) return NextResponse.json({ error: 'The shop printer is offline' }, { status: 503 });
  return NextResponse.json({ shop: { id: shopId, name: shop.data()?.name }, pricing: pricing.data(), agent: { id: agent.id, printers: agent.data().printers ?? [] } });
}
