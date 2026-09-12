"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { paisaToINR } from "@myprint/shared";

interface CreatedShopResponse {
  shop_id: string;
  name: string;
  currency: string;
  qr_path: string;
  auth_token: string;
  agent_id: string;
  agent_token: string;
  pricing: {
    mono_paisa: number;
    color_paisa: number;
    duplex_discount_paisa: number;
    minimum_order_paisa: number;
  };
}

export default function CreateShopPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Merchant auth fields (for unauthenticated users)
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Shop details
  const [name, setName] = useState("");
  const [customShopId, setCustomShopId] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [agentId, setAgentId] = useState("agent-001");

  // Pricing configuration (in Rupees for friendly editing)
  const [monoRupees, setMonoRupees] = useState("2.00");
  const [colorRupees, setColorRupees] = useState("12.00");
  const [duplexDiscountRupees, setDuplexDiscountRupees] = useState("0.25");
  const [minimumOrderRupees, setMinimumOrderRupees] = useState("10.00");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdShop, setCreatedShop] = useState<CreatedShopResponse | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let activeUser = currentUser;

      // Handle in-line authentication if user is not already logged in
      if (!activeUser) {
        if (!email.trim() || !password.trim()) {
          throw new Error(
            "Please enter your email and password to register/login.",
          );
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        if (authMode === "signup") {
          const cred = await createUserWithEmailAndPassword(
            auth,
            email.trim(),
            password,
          );
          activeUser = cred.user;
        } else {
          const cred = await signInWithEmailAndPassword(
            auth,
            email.trim(),
            password,
          );
          activeUser = cred.user;
        }
      }

      const idToken = await activeUser.getIdToken(true);

      const monoPaisa = Math.round(parseFloat(monoRupees || "0") * 100);
      const colorPaisa = Math.round(parseFloat(colorRupees || "0") * 100);
      const duplexDiscountPaisa = Math.round(
        parseFloat(duplexDiscountRupees || "0") * 100,
      );
      const minimumOrderPaisa = Math.round(
        parseFloat(minimumOrderRupees || "0") * 100,
      );

      const payload = {
        name: name.trim(),
        currency: currency.trim() || "INR",
        shop_id: customShopId.trim() || undefined,
        agent_id: agentId.trim() || "agent-001",
        pricing: {
          mono_paisa: monoPaisa,
          color_paisa: colorPaisa,
          duplex_discount_paisa: duplexDiscountPaisa,
          minimum_order_paisa: minimumOrderPaisa,
        },
      };

      const res = await fetch("/api/shops", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create shop");
      }

      setCreatedShop(data as CreatedShopResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function getAgentEnvSnippet(shop: CreatedShopResponse) {
    return `# Desktop Print Agent Configuration
MYPRINT_SHOP_ID=${shop.shop_id}
MYPRINT_AGENT_ID=${shop.agent_id}
MYPRINT_AGENT_CUSTOM_TOKEN=${shop.agent_token}`;
  }

  function copyEnvConfig(snippet: string) {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  if (createdShop) {
    const envSnippet = getAgentEnvSnippet(createdShop);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const customerUrl = `${origin}${createdShop.qr_path}`;

    return (
      <main className="shell">
        <span className="eyebrow">Setup complete</span>
        <h1>Shop Registered Successfully!</h1>
        <p className="good" style={{ fontSize: "1.1rem" }}>
          ✓ &quot;{createdShop.name}&quot; ({createdShop.shop_id}) is now live.
        </p>

        {/* Customer Portal Link */}
        <section className="card">
          <h2>Customer Print Page</h2>
          <p className="muted">
            Customers use this URL (or printed QR code) to send encrypted jobs
            directly to your counter.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <input
              readOnly
              value={customerUrl}
              style={{ flex: "1 1 300px", fontFamily: "monospace" }}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(customerUrl);
                alert("Customer link copied!");
              }}
            >
              Copy Link
            </button>
            <a
              href={createdShop.qr_path}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#38bdf8",
                textDecoration: "none",
                fontWeight: 600,
                padding: "0 8px",
              }}
            >
              Open Page &rarr;
            </a>
          </div>
        </section>

        {/* Desktop Print Agent Provisioning */}
        <section className="card">
          <h2>Desktop Agent Provisioning</h2>
          <p className="muted">
            Configure your desktop edge agent (<code>apps/agent/.env</code>) so
            it connects and receives print jobs in real-time.
          </p>

          <pre
            style={{
              background: "#08101f",
              padding: "16px",
              borderRadius: "9px",
              overflowX: "auto",
              fontSize: "0.85rem",
              border: "1px solid #345278",
              color: "#8ff0c4",
            }}
          >
            {envSnippet}
          </pre>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <button type="button" onClick={() => copyEnvConfig(envSnippet)}>
              {copied ? "✓ Copied to Clipboard!" : "Copy Agent .env Config"}
            </button>
            <span className="muted">
              Paste into <code>apps/agent/.env</code> and run{" "}
              <code>npm run dev:agent</code>
            </span>
          </div>
        </section>

        {/* Pricing Summary */}
        <section className="card">
          <h2>Configured Pricing</h2>
          <div className="grid">
            <div>
              <span className="muted">B&W (Mono)</span>
              <p
                style={{ margin: "4px 0", fontSize: "1.2rem", fontWeight: 700 }}
              >
                {paisaToINR(createdShop.pricing.mono_paisa)}
              </p>
            </div>
            <div>
              <span className="muted">Color</span>
              <p
                style={{ margin: "4px 0", fontSize: "1.2rem", fontWeight: 700 }}
              >
                {paisaToINR(createdShop.pricing.color_paisa)}
              </p>
            </div>
            <div>
              <span className="muted">Duplex Discount</span>
              <p
                style={{ margin: "4px 0", fontSize: "1.2rem", fontWeight: 700 }}
              >
                {paisaToINR(createdShop.pricing.duplex_discount_paisa)}
              </p>
            </div>
            <div>
              <span className="muted">Minimum Order</span>
              <p
                style={{ margin: "4px 0", fontSize: "1.2rem", fontWeight: 700 }}
              >
                {paisaToINR(createdShop.pricing.minimum_order_paisa)}
              </p>
            </div>
          </div>
        </section>

        <div style={{ marginTop: 24, display: "flex", gap: 16 }}>
          <Link href="/merchant" style={{ textDecoration: "none" }}>
            <button type="button">Go to Merchant Dashboard &rarr;</button>
          </Link>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "1px solid #345278",
              color: "#ecf3ff",
            }}
            onClick={() => {
              setCreatedShop(null);
              setName("");
              setCustomShopId("");
            }}
          >
            Create Another Shop
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <span className="eyebrow">MyPrint · merchant onboarding</span>
      <h1>Create your Print Shop</h1>
      <p className="muted">
        Register your shop, define your per-page pricing, and generate secure
        desktop agent credentials.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Merchant Authentication (if not signed in) */}
        {!authLoading && !currentUser && (
          <section className="card">
            <h2>Merchant Account</h2>
            <p className="muted">
              {authMode === "signup"
                ? "Create an owner account to manage your shop and cash approvals."
                : "Sign in to associate this new shop with your existing owner account."}
            </p>

            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                style={{
                  background: authMode === "signup" ? "#38bdf8" : "#0b1629",
                  color: authMode === "signup" ? "#062139" : "#ecf3ff",
                  border: "1px solid #345278",
                }}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                style={{
                  background: authMode === "login" ? "#38bdf8" : "#0b1629",
                  color: authMode === "login" ? "#062139" : "#ecf3ff",
                  border: "1px solid #345278",
                }}
              >
                Sign In
              </button>
            </div>

            <label>
              Email address
              <input
                type="email"
                required
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label>
              Password
              <input
                type="password"
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </section>
        )}

        {currentUser && (
          <section className="card" style={{ padding: "14px 24px" }}>
            <p className="muted" style={{ margin: 0 }}>
              Authenticated as{" "}
              <strong style={{ color: "#ecf3ff" }}>
                {currentUser.email || currentUser.uid}
              </strong>
            </p>
          </section>
        )}

        {/* Shop Details */}
        <section className="card">
          <h2>Shop Details</h2>
          <label>
            Shop Name *
            <input
              type="text"
              required
              placeholder="e.g. Apex Photocopy & Cyber Cafe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="grid">
            <label>
              Custom Shop ID (Optional)
              <input
                type="text"
                placeholder="e.g. apex-prints (auto-generated if empty)"
                value={customShopId}
                onChange={(e) => setCustomShopId(e.target.value)}
              />
            </label>

            <label>
              Currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </label>

            <label>
              Initial Agent ID
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent-001"
              />
            </label>
          </div>
        </section>

        {/* Pricing Rules */}
        <section className="card">
          <h2>Print Pricing (in ₹ INR)</h2>
          <p className="muted">
            Configure base rates. Server recalculates and freezes order totals
            atomically.
          </p>

          <div className="grid">
            <label>
              B&W Rate / Page (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={monoRupees}
                onChange={(e) => setMonoRupees(e.target.value)}
              />
            </label>

            <label>
              Color Rate / Page (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={colorRupees}
                onChange={(e) => setColorRupees(e.target.value)}
              />
            </label>

            <label>
              Duplex Discount / Page (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={duplexDiscountRupees}
                onChange={(e) => setDuplexDiscountRupees(e.target.value)}
              />
            </label>

            <label>
              Minimum Order Total (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={minimumOrderRupees}
                onChange={(e) => setMinimumOrderRupees(e.target.value)}
              />
            </label>
          </div>
        </section>

        {error && (
          <p className="warn" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <button type="submit" disabled={submitting || !name.trim()}>
            {submitting
              ? "Registering shop…"
              : "Register Shop & Mint Agent Token"}
          </button>
          <Link
            href="/merchant"
            style={{ color: "#9db0cc", textDecoration: "none" }}
          >
            Back to Dashboard
          </Link>
        </div>
      </form>
    </main>
  );
}
