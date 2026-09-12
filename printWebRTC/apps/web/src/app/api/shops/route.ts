import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, verifiedUser } from "@/lib/admin";
import { type Pricing } from "@myprint/shared";

const DEFAULT_PRICING: Pricing = {
  mono_paisa: 200,
  color_paisa: 1200,
  duplex_discount_paisa: 25,
  minimum_order_paisa: 1000,
};

function resolvePricing(input?: any): Pricing {
  if (!input || typeof input !== "object") return DEFAULT_PRICING;

  const validatePaisa = (
    val: unknown,
    fallback: number,
    field: string,
  ): number => {
    if (val === undefined || val === null) return fallback;
    if (typeof val !== "number" || !Number.isSafeInteger(val) || val < 0) {
      throw new Error(
        `Invalid pricing for ${field}: must be a non-negative integer (paisa)`,
      );
    }
    return val;
  };

  return {
    mono_paisa: validatePaisa(
      input.mono_paisa,
      DEFAULT_PRICING.mono_paisa,
      "mono_paisa",
    ),
    color_paisa: validatePaisa(
      input.color_paisa,
      DEFAULT_PRICING.color_paisa,
      "color_paisa",
    ),
    duplex_discount_paisa: validatePaisa(
      input.duplex_discount_paisa,
      DEFAULT_PRICING.duplex_discount_paisa,
      "duplex_discount_paisa",
    ),
    minimum_order_paisa: validatePaisa(
      input.minimum_order_paisa,
      DEFAULT_PRICING.minimum_order_paisa,
      "minimum_order_paisa",
    ),
  };
}

// Call only after an authenticated owner has completed your merchant onboarding/KYC step.
export async function POST(request: Request) {
  try {
    const owner = await verifiedUser(request);

    let body: any;
    try {
      body = await request.json();
    } catch {
      throw new Error("Invalid JSON request body");
    }

    const {
      name,
      currency = "INR",
      agent_id,
      pricing: rawPricing,
      shop_id: requestedShopId,
    } = body ?? {};

    if (typeof name !== "string" || name.trim().length < 2) {
      throw new Error("A shop name is required (minimum 2 characters)");
    }
    if (name.trim().length > 100) {
      throw new Error("Shop name must not exceed 100 characters");
    }

    const normalizedCurrency =
      typeof currency === "string" && currency.trim()
        ? currency.trim().toUpperCase()
        : "INR";
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new Error("Currency must be a valid 3-letter ISO code (e.g. INR)");
    }

    let shopId: string;
    if (typeof requestedShopId === "string" && requestedShopId.trim()) {
      const customId = requestedShopId.trim();
      if (!/^[a-zA-Z0-9_-]{3,50}$/.test(customId)) {
        throw new Error(
          "Custom shop_id must be alphanumeric with hyphens/underscores (3-50 chars)",
        );
      }
      const existingDoc = await adminDb.doc(`shops/${customId}`).get();
      if (existingDoc.exists) {
        throw new Error(`Shop with ID "${customId}" already exists`);
      }
      shopId = customId;
    } else {
      shopId = `sh_${randomBytes(12).toString("base64url")}`;
    }

    const agentId =
      typeof agent_id === "string" && agent_id.trim()
        ? agent_id.trim()
        : "agent-001";
    if (!/^[a-zA-Z0-9_-]{3,50}$/.test(agentId)) {
      throw new Error(
        "agent_id must be alphanumeric with hyphens/underscores (3-50 chars)",
      );
    }

    const pricing = resolvePricing(rawPricing);

    // Atomic batch creation for shop, pricing, and initial agent records
    const batch = adminDb.batch();

    const shopRef = adminDb.doc(`shops/${shopId}`);
    const pricingRef = adminDb.doc(`shops/${shopId}/pricing/current`);
    const agentRef = adminDb.doc(`shops/${shopId}/agents/${agentId}`);

    batch.create(shopRef, {
      id: shopId,
      name: name.trim(),
      owner_uid: owner.uid,
      owner_email: owner.email ?? null,
      currency: normalizedCurrency,
      active: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    batch.create(pricingRef, {
      ...pricing,
      currency: normalizedCurrency,
      updated_at: FieldValue.serverTimestamp(),
    });

    batch.create(agentRef, {
      id: agentId,
      shop_id: shopId,
      online: false,
      printers: [],
      created_at: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Assign custom claims to the owner
    await adminAuth.setCustomUserClaims(owner.uid, {
      role: "merchant",
      shop_id: shopId,
    });

    // Mint tokens: bootstrap merchant token and desktop agent provisioning token
    const auth_token = await adminAuth.createCustomToken(owner.uid, {
      role: "merchant",
      shop_id: shopId,
    });
    const agent_token = await adminAuth.createCustomToken(agentId, {
      role: "agent",
      shop_id: shopId,
    });

    return NextResponse.json(
      {
        shop_id: shopId,
        name: name.trim(),
        currency: normalizedCurrency,
        qr_path: `/p/${shopId}`,
        auth_token,
        agent_id: agentId,
        agent_token,
        pricing,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Shop registration failed",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const user = await verifiedUser(request);

    if (typeof user.shop_id === "string") {
      const [shopSnap, pricingSnap, agentsSnap] = await Promise.all([
        adminDb.doc(`shops/${user.shop_id}`).get(),
        adminDb.doc(`shops/${user.shop_id}/pricing/current`).get(),
        adminDb.collection(`shops/${user.shop_id}/agents`).get(),
      ]);

      if (!shopSnap.exists) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }

      return NextResponse.json({
        shop: { id: user.shop_id, ...shopSnap.data() },
        pricing: pricingSnap.exists ? pricingSnap.data() : null,
        agents: agentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }

    const querySnap = await adminDb
      .collection("shops")
      .where("owner_uid", "==", user.uid)
      .limit(10)
      .get();

    const shops = querySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ shops });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
