import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, verifiedUser } from '@/lib/admin';

// Call only after an authenticated owner has completed your merchant onboarding/KYC step.
export async function POST(request: Request) {
  try {
    const owner = await verifiedUser(request); const { name, currency = 'INR' } = await request.json();
    if (typeof name !== 'string' || name.trim().length < 2) throw new Error('A shop name is required');
    const shopId = `sh_${randomBytes(12).toString('base64url')}`;
    await adminDb.doc(`shops/${shopId}`).create({ name: name.trim(), owner_uid: owner.uid, currency, created_at: FieldValue.serverTimestamp(), active: true });
    await adminDb.doc(`shops/${shopId}/pricing/current`).create({ mono_paisa: 200, color_paisa: 1200, duplex_discount_paisa: 25, minimum_order_paisa: 1000, updated_at: FieldValue.serverTimestamp() });
    await adminAuth.setCustomUserClaims(owner.uid, { role: 'merchant', shop_id: shopId });
    // A signed Firebase custom token is a cryptographic short-lived bootstrap token, not a homemade API secret.
    const auth_token = await adminAuth.createCustomToken(owner.uid, { role: 'merchant', shop_id: shopId });
    return NextResponse.json({ shop_id: shopId, auth_token }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Shop registration failed' }, { status: 400 }); }
}
