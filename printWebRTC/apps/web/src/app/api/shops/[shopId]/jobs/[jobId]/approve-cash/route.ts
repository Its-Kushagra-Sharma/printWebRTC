import { NextResponse } from 'next/server';
import { adminDb, verifiedUser } from '@/lib/admin';

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string; jobId: string }> }) {
  try {
    const user = await verifiedUser(request); const { shopId, jobId } = await params;
    if (user.role !== 'merchant' || user.shop_id !== shopId) throw new Error('Not authorized for this shop');
    const ref = adminDb.doc(`shops/${shopId}/jobs/${jobId}`);
    await adminDb.runTransaction(async (tx) => { const job = await tx.get(ref); if (!job.exists || job.data()?.status !== 'awaiting_cash_approval') throw new Error('Job cannot be approved'); tx.update(ref, { status: 'ready_for_transfer', cash_approved_by: user.uid, cash_approved_at: new Date() }); });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Approval failed' }, { status: 403 }); }
}
