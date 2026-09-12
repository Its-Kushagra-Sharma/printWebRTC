"use client";
import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { paisaToINR } from "@myprint/shared";
type Job = { id: string; file_name: string; fee_paisa: number };
export default function MerchantDashboard() {
  const [shopId, setShopId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!shopId) return;
    return onSnapshot(
      query(
        collection(db, "shops", shopId, "jobs"),
        where("status", "==", "awaiting_cash_approval"),
      ),
      (s) =>
        setJobs(
          s.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Job)
            .sort(
              (a, b) =>
                (b as any).created_at?.seconds - (a as any).created_at?.seconds,
            ),
        ),
      (e) => setError(e.message),
    );
  }, [shopId]);
  async function login() {
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const token = await credential.user.getIdTokenResult();
      const tenant = token.claims.shop_id;
      if (typeof tenant !== "string")
        throw new Error("Merchant account has no shop assignment");
      setShopId(tenant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }
  async function approve(id: string) {
    const token = await auth.currentUser?.getIdToken();
    const r = await fetch(`/api/shops/${shopId}/jobs/${id}/approve-cash`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) setError((await r.json()).error);
  }
  if (!shopId)
    return (
      <main className="shell">
        <span className="eyebrow">MyPrint merchant</span>
        <section className="card">
          <h1>Shop console</h1>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button onClick={() => void login()}>Secure sign in</button>
          <p className="warn">{error}</p>
          <p className="muted" style={{ marginTop: 18 }}>
            New merchant or need another shop?{" "}
            <a
              href="/merchant/create"
              style={{
                color: "#38bdf8",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Create new shop &rarr;
            </a>
          </p>
        </section>
      </main>
    );
  return (
    <main className="shell">
      <span className="eyebrow">Shop {shopId}</span>
      <h1>Cash approvals</h1>
      <section className="card">
        {jobs.length === 0 ? (
          <p className="muted">No cash jobs waiting.</p>
        ) : (
          jobs.map((job) => (
            <div className="grid" key={job.id}>
              <span>
                {job.file_name}
                <br />
                <small className="muted">{paisaToINR(job.fee_paisa)}</small>
              </span>
              <button onClick={() => void approve(job.id)}>
                Approve cash & print
              </button>
            </div>
          ))
        )}
        <p className="warn">{error}</p>
      </section>
    </main>
  );
}
