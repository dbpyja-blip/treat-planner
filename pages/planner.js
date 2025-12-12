import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

// Dedicated planner page: shows loading then Plan A/B/C cards with editable text.
export default function Planner() {
  const [transcriptionText, setTranscriptionText] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ready | selected | error
  const [plans, setPlans] = useState([]);
  const [planEdits, setPlanEdits] = useState({});
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [error, setError] = useState("");

  const slotId = "b553d02b-102c-457b-b525-0bfca777b191"; // provided constant slot id
  const userId = "user-123";

  const createSessionId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `session-${Date.now()}`;
  };

  const formatSpecs = (specs = {}) =>
    Object.entries(specs)
      .map(([k, v]) => `    - ${k}: ${v}`)
      .join("\n");

  const formatCostVars = (options = []) =>
    options
      .map(
        (o) =>
          `    - session: ${o.session ?? "-"}, cost_per_session: ${o.cost_per_session ?? "-"}, grafts: ${o.grafts ?? "-"}, weight: ${o.weight ?? "-"}`
      )
      .join("\n");

  const formatPlanNotes = (plan) => {
    const services =
      plan.services
        ?.map((s) => {
          const specText = s.specifications ? formatSpecs(s.specifications) : "";
          const costText = s.service_cost_variable_options ? formatCostVars(s.service_cost_variable_options) : "";
          return [
            `• Service: ${s.service_name || "Service"}`,
            specText,
            costText ? "    - cost options:" : "",
            costText,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n") || "";

    const products =
      plan.products
        ?.map((p) => {
          const details = [
            p.composition ? `    - composition: ${p.composition}` : "",
            p.dosage ? `    - dosage: ${p.dosage}` : "",
            p.frequency ? `    - frequency: ${p.frequency}` : "",
            p.duration ? `    - duration: ${p.duration}` : "",
            p.route ? `    - route: ${p.route}` : "",
            p.instruction ? `    - instruction: ${p.instruction}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          return [`• Product: ${p.product_name || p.name || "Product"}`, details].filter(Boolean).join("\n");
        })
        .join("\n") || "";

    const labs =
      plan.lab_tests?.map((l) => `• Lab: ${l.lab_test_name || l.name || "Lab Test"}`).join("\n") || "";

    return `${plan.plan_name || `Plan ${plan.plan_id}`}\n${[services, products, labs].filter(Boolean).join("\n")}`;
  };

  const labelize = (key) =>
    key
      .replace(/_/g, " ")
      .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

  const safeValue = (val) => (val === null || val === undefined ? "" : val);

  const loadTranscription = () => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("planner:transcription") || "";
  };

  const callPlanner = async (text) => {
    try {
      setError("");
      setStatus("loading");
      const sid = createSessionId();
      setSessionId(sid);

      const payload = {
        session_id: sid,
        user_id: userId,
        slot_id: slotId,
        treatment_planner_text: text,
      };

      // Client-side console log for debugging the outgoing request.
      console.log("[planner] sending request", payload);

      const response = await fetch("/api/treatment-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to generate treatment plans");
      }

      const data = await response.json();
      const nextPlans = data.treatment_plans || [];
      const nextEdits = {};
      nextPlans.forEach((plan) => {
        // Clone to allow local edits without mutating original response reference
        nextEdits[plan.plan_id] = JSON.parse(JSON.stringify(plan));
      });
      setPlans(nextPlans);
      setPlanEdits(nextEdits);
      setStatus("ready");
    } catch (err) {
      console.error("Planner error:", err);
      setError(err.message || "Failed to generate treatment plans");
      setStatus("error");
    }
  };

  useEffect(() => {
    const text = loadTranscription();
    setTranscriptionText(text);
    if (text) {
      callPlanner(text);
    } else {
      setError("No transcription text found. Go back and generate a transcript first.");
    }
  }, []);

  const headerSubtitle = useMemo(() => {
    if (status === "loading") return "Generating Plans A/B/C... this can take 2-3 minutes.";
    if (status === "ready") return "Plans A/B/C are editable; pick one and confirm.";
    if (status === "selected") return "You have confirmed your selection.";
    return "Generate treatment plans from your transcript.";
  }, [status]);

  const updateServiceSpec = (planId, serviceIndex, key, value) => {
    setPlanEdits((prev) => {
      const draft = { ...prev };
      const plan = { ...(draft[planId] || {}), services: [...(draft[planId]?.services || [])] };
      const service = { ...(plan.services[serviceIndex] || {}), specifications: { ...(plan.services[serviceIndex]?.specifications || {}) } };
      service.specifications[key] = value;
      plan.services[serviceIndex] = service;
      draft[planId] = plan;
      return draft;
    });
  };

  const updateProductField = (planId, productIndex, key, value) => {
    setPlanEdits((prev) => {
      const draft = { ...prev };
      const plan = { ...(draft[planId] || {}), products: [...(draft[planId]?.products || [])] };
      const product = { ...(plan.products[productIndex] || {}) };
      product[key] = value;
      plan.products[productIndex] = product;
      draft[planId] = plan;
      return draft;
    });
  };

  const updateLabField = (planId, labIndex, key, value) => {
    setPlanEdits((prev) => {
      const draft = { ...prev };
      const plan = { ...(draft[planId] || {}), lab_tests: [...(draft[planId]?.lab_tests || [])] };
      const lab = { ...(plan.lab_tests[labIndex] || {}) };
      lab[key] = value;
      plan.lab_tests[labIndex] = lab;
      draft[planId] = plan;
      return draft;
    });
  };

  return (
    <>
      <Head>
        <title>Treatment Plan Planner | AssemblyAI</title>
      </Head>
      <div className="shell" style={{ width: "min(1200px, 100%)", marginTop: 8 }}>
        <div className="glass">
          <div className="header">
            <div className="hero">
              <div className="title">
                <div className="badge">Planner</div>
                <h1>Treatment Plans</h1>
              </div>
              <p className="subtitle">{headerSubtitle}</p>
            </div>
            <Link href="/" legacyBehavior>
              <a className="btn-back" style={{ textDecoration: "none", background: "#2b1a0f", color: "#fff" }}>
                Back to Recorder
              </a>
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="transcription-header" style={{ gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2>Session</h2>
              <p className="muted">{sessionId || "Preparing..."}</p>
            </div>
            <div className="stat-group">
              <span className="pill">Slot</span>
              <span className="stat-label">{slotId}</span>
            </div>
            {transcriptionText ? (
              <div className="stat-group">
                <span className="pill" style={{ background: "rgba(31,138,90,0.12)", color: "#1f8a5a" }}>
                  Transcript ready
                </span>
              </div>
            ) : null}
          </div>

          {status === "loading" && (
            <div className="loading">
              <div className="spinner" />
              <p>Calling treatment planner... this may take up to 2-3 minutes.</p>
              <p className="muted">Please keep this page open while we fetch Plans A/B/C.</p>
            </div>
          )}

          {status === "error" && (
            <div className="error">
              {error || "Unable to generate treatment plans."}
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/" legacyBehavior>
                  <a className="btn-back">Back</a>
                </Link>
                {transcriptionText && (
                  <button className="btn-back" onClick={() => callPlanner(transcriptionText)}>Retry</button>
                )}
              </div>
            </div>
          )}

          {status === "ready" && (
            <div className="grid" style={{ marginTop: 6, gridTemplateColumns: "1fr" }}>
              {plans.map((plan) => {
                const editedPlan = planEdits[plan.plan_id] || plan;
                const planServices = editedPlan.services || [];
                const products = editedPlan.products || [];
                const labs = editedPlan.lab_tests || [];
                return (
                  <div key={plan.plan_id} className="plan-card">
                    <div className="plan-head">
                      <div>
                        <div className="plan-title">{editedPlan.plan_name || `Plan ${plan.plan_id}`}</div>
                        <div className="plan-sub">Edit details; verify before selecting.</div>
                      </div>
                      <button
                        className="btn-back"
                        onClick={() => {
                          setSelectedPlanId(plan.plan_id);
                          setStatus("selected");
                        }}
                        style={{ background: "#2b1a0f" }}
                      >
                        Select
                      </button>
                    </div>

                    <div className="plan-meta">
                      <span className="pill">Services: {planServices.length}</span>
                      <span className="pill">Products: {products.length}</span>
                      <span className="pill">Labs: {labs.length}</span>
                    </div>

                    {planServices.length > 0 && (
                      <div className="section">
                        <div className="section-head">
                          <div className="section-title">Services</div>
                        </div>
                        <div className="section-body">
                          {planServices.map((srv, idx) => (
                            <div key={idx} className="service-card">
                              <div className="service-head">
                                <div>
                                  <div className="service-name">{srv.service_name || "Service"}</div>
                                  <div className="service-sub">Basic details</div>
                                </div>
                                {srv.verified && <span className="badge-verified">Verified</span>}
                              </div>
                              <div className="form-grid">
                                {Object.entries(srv.specifications || {}).map(([k, v]) => (
                                  <label key={k} className="form-field">
                                    <span className="form-label">{labelize(k)}</span>
                                    <input
                                      className="form-input"
                                      placeholder={`Enter ${labelize(k).toLowerCase()}`}
                                      value={safeValue(v)}
                                      onChange={(e) => updateServiceSpec(plan.plan_id, idx, k, e.target.value)}
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {products.length > 0 && (
                      <div className="section">
                        <div className="section-head">
                          <div className="section-title">Products</div>
                        </div>
                        <div className="section-body product-grid">
                          {products.map((p, idx) => (
                            <div key={idx} className="product-card">
                              <div className="product-head">
                                <div className="product-name">{p.name || p.product_name || "Product"}</div>
                                {p.verified && <span className="badge-verified">Verified</span>}
                              </div>
                              <div className="form-grid">
                                {["dosage", "frequency", "duration", "route", "instruction"].map((field) => (
                                  <label key={field} className="form-field">
                                    <span className="form-label">{labelize(field)}</span>
                                    <input
                                      className="form-input"
                                      placeholder={p[field] ? "" : `Enter ${labelize(field).toLowerCase()}`}
                                      value={safeValue(p[field])}
                                      onChange={(e) => updateProductField(plan.plan_id, idx, field, e.target.value)}
                                    />
                                  </label>
                                ))}
                                {p.pricing && (p.pricing.MRP_cost !== null || p.pricing.cost !== null) ? (
                                  <>
                                    {p.pricing.MRP_cost !== null && (
                                      <label className="form-field">
                                        <span className="form-label">MRP Cost</span>
                                        <input
                                          className="form-input"
                                          placeholder="Enter MRP cost"
                                          value={safeValue(p.pricing.MRP_cost)}
                                          onChange={(e) =>
                                            updateProductField(plan.plan_id, idx, "pricing", {
                                              ...p.pricing,
                                              MRP_cost: e.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                    )}
                                    {p.pricing.cost !== null && (
                                      <label className="form-field">
                                        <span className="form-label">Cost</span>
                                        <input
                                          className="form-input"
                                          placeholder="Enter cost"
                                          value={safeValue(p.pricing.cost)}
                                          onChange={(e) =>
                                            updateProductField(plan.plan_id, idx, "pricing", {
                                              ...p.pricing,
                                              cost: e.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {labs.length > 0 && (
                      <div className="section">
                        <div className="section-head">
                          <div className="section-title">Lab Tests</div>
                        </div>
                        <div className="section-body lab-grid">
                          {labs.map((l, idx) => {
                            const labName = l.lab_test_name || l.name || "";
                            const hasPrice = l.price !== null && l.price !== undefined && l.price !== 0 && l.price !== "";
                            return (
                              <div key={idx} className="lab-card">
                                <div className="lab-head">
                                  <input
                                    className="form-input"
                                    placeholder="Enter lab test name"
                                    value={safeValue(labName)}
                                    onChange={(e) => updateLabField(plan.plan_id, idx, "name", e.target.value)}
                                  />
                                  {l.verified && <span className="badge-verified">Verified</span>}
                                </div>
                                {hasPrice && (
                                  <div className="form-grid">
                                    <label className="form-field">
                                      <span className="form-label">Price</span>
                                      <input
                                        className="form-input"
                                        placeholder="Enter price"
                                        value={safeValue(l.price)}
                                        onChange={(e) => updateLabField(plan.plan_id, idx, "price", e.target.value)}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {status === "selected" && (
            <div className="card" style={{ marginTop: 12, background: "#fff7e5", border: "1px solid #f0d59a" }}>
              <h3 style={{ color: "var(--text-primary)", marginBottom: 8 }}>
                You have successfully selected Plan {selectedPlanId || "?"}
              </h3>
              <p className="muted">Session: {sessionId || "N/A"}</p>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/" legacyBehavior>
                  <a className="btn-back">Back to Recorder</a>
                </Link>
                <button className="btn-submit" onClick={() => setStatus("ready")}>
                  Change Selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

