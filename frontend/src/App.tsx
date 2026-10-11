
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import "./App.css";

const API = "http://127.0.0.1:8001";

type Diagnosis = {
  status?: string;
  finding?: string;
  message?: string;
  error_type?: string;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
};

type Incident = {
  id: string;
  service: string;
  problem: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  diagnosis?: Diagnosis;
  resolution_notes?: string;
  root_cause?: string;
  resolution?: string;
  verification_notes?: string;
  [key: string]: unknown;
};

type InvestigationResult = {
  incident?: Incident;
  diagnosis?: Diagnosis;
  api_health?: Record<string, unknown>;
  database_connectivity?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  ai_analysis?: string;
  memory_used?: unknown[];
  [key: string]: unknown;
};

type ObservedEvidence = {
  title: string;
  status: string;
  finding: string;
  details: string[];
};

function readable(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function readableDiagnosis(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const diagnosis = value as Diagnosis;
    return (
      diagnosis.finding ||
      diagnosis.message ||
      diagnosis.status ||
      "The investigation did not provide a detailed diagnosis."
    );
  }

  return "No diagnosis was returned.";
}

function normalizeIncident(raw: Record<string, unknown>): Incident {
  return {
    ...raw,
    id: String(raw.id ?? raw._id ?? raw.incident_id ?? ""),
    service: String(raw.service ?? raw.service_name ?? "Unknown service"),
    problem: String(raw.problem ?? raw.description ?? "No description"),
    status: String(raw.status ?? "open"),
  };
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item: { loc?: unknown[]; msg?: string }) => {
                const location = item.loc?.join(".");
                return location
                  ? `${location}: ${item.msg ?? "Invalid value"}`
                  : item.msg ?? "Invalid request";
              })
              .join("; ")
          : body?.message ?? `Request failed with HTTP ${response.status}`;

    throw new Error(String(message));
  }

  return body as T;
}

function getObservedEvidence(
  result: InvestigationResult | null,
): ObservedEvidence | null {
  if (!result) return null;

  // MongoDB direct diagnostic: evidence is nested inside diagnosis.
  const diagnosis = result.diagnosis;
  const diagnosisEvidence = diagnosis?.evidence;

  if (
    diagnosisEvidence &&
    typeof diagnosisEvidence === "object"
  ) {
    return {
      title: "MongoDB connectivity",
      status: readable(diagnosis?.status ?? "unknown"),
      finding: readable(
        diagnosis?.finding ??
          "MongoDB diagnostic evidence was collected.",
      ),
      details: Object.entries(diagnosisEvidence).map(
        ([key, value]) =>
          `${key.replaceAll("_", " ")}: ${readable(value)}`,
      ),
    };
  }

  // Payment service diagnostic.
  const db = result.database_connectivity;
  if (db && typeof db === "object") {
    const details: string[] = [];

    if (db.ping_ok !== undefined) {
      details.push(`MongoDB ping successful: ${readable(db.ping_ok)}`);
    }
    if (db.simulated !== undefined) {
      details.push(`Simulated evidence: ${readable(db.simulated)}`);
    }
    if (db.error_type) {
      details.push(`Error type: ${readable(db.error_type)}`);
    }

    if (db.evidence && typeof db.evidence === "object") {
      Object.entries(db.evidence as Record<string, unknown>).forEach(
        ([key, value]) => {
          details.push(`${key.replaceAll("_", " ")}: ${readable(value)}`);
        },
      );
    }

    return {
      title: "MongoDB connectivity",
      status: readable(db.status ?? (db.connected ? "connected" : "unknown")),
      finding: readable(db.finding ?? db.message ?? db.status),
      details,
    };
  }

  // API health diagnostic.
  const apiHealth =
    result.api_health ??
    (diagnosis && "api_health" in diagnosis
      ? diagnosis.api_health as Record<string, unknown>
      : undefined);

  if (apiHealth && typeof apiHealth === "object") {
    const details: string[] = [];

    if (apiHealth.http_status !== undefined) {
      details.push(`HTTP status: ${readable(apiHealth.http_status)}`);
    }
    if (apiHealth.endpoint) {
      details.push(`Endpoint: ${readable(apiHealth.endpoint)}`);
    }
    if (apiHealth.simulated !== undefined) {
      details.push(`Simulated evidence: ${readable(apiHealth.simulated)}`);
    }

    if (apiHealth.evidence && typeof apiHealth.evidence === "object") {
      Object.entries(apiHealth.evidence as Record<string, unknown>).forEach(
        ([key, value]) => {
          details.push(`${key.replaceAll("_", " ")}: ${readable(value)}`);
        },
      );
    }

    return {
      title: "API health",
      status: readable(apiHealth.status ?? "unknown"),
      finding: readable(
        apiHealth.finding ?? apiHealth.message ?? apiHealth.status,
      ),
      details,
    };
  }

  // Generic top-level evidence.
  const evidence = result.evidence;
  if (evidence && typeof evidence === "object") {
    return {
      title: "Investigation evidence",
      status: "collected",
      finding: "Evidence returned by the diagnostic tools.",
      details: Object.entries(evidence).map(
        ([key, value]) =>
          `${key.replaceAll("_", " ")}: ${readable(value)}`,
      ),
    };
  }

  return null;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isResolved(status: string): boolean {
  return ["resolved", "closed", "fixed"].includes(status.toLowerCase());
}

/**
 * Minimal Markdown-style renderer for trusted AI-analysis text.
 * React escapes text nodes; this does not inject raw HTML.
 */
function FormattedAnalysis({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const elements: ReactNode[] = [];
  let bullets: string[] = [];

  function formatInline(line: string): ReactNode[] {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index}>{part.slice(1, -1)}</code>;
      }

      return part;
    });
  }

  function flushBullets() {
    if (bullets.length === 0) return;

    elements.push(
      <ul key={`list-${elements.length}`}>
        {bullets.map((bullet, index) => (
          <li key={index}>{formatInline(bullet)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushBullets();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushBullets();
      const content = formatInline(heading[2]);
      const key = `heading-${elements.length}`;

      if (heading[1].length === 1) {
        elements.push(<h3 key={key}>{content}</h3>);
      } else {
        elements.push(<h4 key={key}>{content}</h4>);
      }
      return;
    }

    if (line.startsWith("**") && line.endsWith("**") &&
        line.indexOf("**", 2) === line.length - 2) {
      flushBullets();
      elements.push(
        <h4 key={`section-${elements.length}`}>
          {line.slice(2, -2)}
        </h4>,
      );
      return;
    }

    const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }

    flushBullets();
    elements.push(
      <p key={`paragraph-${elements.length}`}>
        {formatInline(line)}
      </p>,
    );
  });

  flushBullets();

  return <div className="formatted-analysis">{elements}</div>;
}

function StatusPill({ status }: { status: string }) {
  const closed = isResolved(status);

  return (
    <span className={`status-pill ${closed ? "status-closed" : "status-open"}`}>
      <span className="status-pill-dot" />
      {status || "open"}
    </span>
  );
}

function PanelHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action && <div className="panel-heading-action">{action}</div>}
    </div>
  );
}

function App() {
  const [service, setService] = useState("payment-service");
  const [problem, setProblem] = useState(
    "Investigate the current health of this service and identify the root cause if supported by evidence.",
  );
  const [history, setHistory] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [investigating, setInvestigating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);

    try {
      const data = await requestJson<
        | Incident[]
        | {
            incidents?: Record<string, unknown>[];
            items?: Record<string, unknown>[];
          }
      >("/incidents");

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.incidents)
          ? data.incidents
          : Array.isArray(data.items)
            ? data.items
            : [];

      const normalized = items.map((item) =>
        normalizeIncident(item as unknown as Record<string, unknown>),
      );

      setHistory(normalized);

      setSelected((previous) => {
        if (!previous) return null;
        return normalized.find((item) => item.id === previous.id) ?? previous;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not load incident history: ${err.message}`
          : "Could not load incident history.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleInvestigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setInvestigating(true);
    setResult(null);
    setSelected(null);

    try {
      const data = await requestJson<InvestigationResult>("/investigate", {
        method: "POST",
        body: JSON.stringify({ service, problem }),
      });

      setResult(data);

      if (data.incident) {
        const incident = normalizeIncident(
          data.incident as unknown as Record<string, unknown>,
        );
        setSelected(incident);
        setResolutionNotes(incident.resolution_notes ?? "");
        setRootCause(incident.root_cause ?? "");
        setVerificationNotes(incident.verification_notes ?? "");
      }

      setNotice(
        "Investigation completed. Review the evidence before taking action.",
      );
      await loadHistory();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Investigation failed: ${err.message}`
          : "Investigation failed. Please try again.",
      );
    } finally {
      setInvestigating(false);
    }
  }

  async function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected?.id) {
      setError("Select an incident with a valid ID before resolving it.");
      return;
    }

    const cause = rootCause.trim();
    const resolution = resolutionNotes.trim();
    const verification = verificationNotes.trim();

    if (cause.length < 3 || resolution.length < 3 || verification.length < 3) {
      setError(
        "Please provide a root cause, resolution, and verification notes. Each field must contain at least 3 characters.",
      );
      return;
    }

    setError("");
    setNotice("");
    setResolving(true);

    try {
      const updated = await requestJson<Record<string, unknown>>(
        `/incidents/${encodeURIComponent(selected.id)}/resolve`,
        {
          method: "PATCH",
          body: JSON.stringify({
            root_cause: cause,
            resolution,
            verification_notes: verification,
          }),
        },
      );

      setNotice("Incident marked as resolved successfully.");
      await loadHistory();

      const returnedIncident =
        updated && typeof updated === "object"
          ? (updated.incident ?? updated) as Record<string, unknown>
          : null;

      if (
        returnedIncident &&
        (returnedIncident.id ||
          returnedIncident._id ||
          returnedIncident.incident_id)
      ) {
        const normalized = normalizeIncident(returnedIncident);
        setSelected(normalized);
      }

      setResolutionNotes(resolution);
      setRootCause(cause);
      setVerificationNotes(verification);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not resolve incident: ${err.message}`
          : "Could not resolve incident.",
      );
    } finally {
      setResolving(false);
    }
  }

  async function handleDelete(incident: Incident) {
    if (!incident.id) {
      setError("This incident does not have a valid ID.");
      return;
    }

    if (
      !window.confirm(
        `Delete the incident for "${incident.service}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingId(incident.id);

    try {
      await requestJson(
        `/incidents/${encodeURIComponent(incident.id)}`,
        { method: "DELETE" },
      );

      if (selected?.id === incident.id) {
        setSelected(null);
      }

      setNotice("Incident deleted.");
      await loadHistory();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not delete incident: ${err.message}`
          : "Could not delete incident.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function selectIncident(incident: Incident) {
    setSelected(incident);
    setResolutionNotes(
      incident.resolution ?? incident.resolution_notes ?? "",
    );
    setRootCause(incident.root_cause ?? "");
    setVerificationNotes(incident.verification_notes ?? "");
    setError("");
    setNotice("");
  }

  const openCount = history.filter(
    (item) => !isResolved(item.status),
  ).length;
  const resolvedCount = history.filter(
    (item) => isResolved(item.status),
  ).length;
  const evidence = getObservedEvidence(result);
  const diagnosisStatus = String(result?.diagnosis?.status ?? "unknown");

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" aria-label="NEXUS home">
          <span className="brand-mark">
            <span /><span /><span /><span />
          </span>
          <span className="brand-name">
            NEXUS
            <small>AI PRODUCTION ENGINEER</small>
          </span>
        </a>

        <div className="topbar-right">
          <span className="environment-label">LOCAL DEVELOPMENT</span>
          <div className="system-status">
            <span className="status-dot" />
            <span>Support console</span>
          </div>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow">
              <span className="eyebrow-line" />
              INCIDENT INTELLIGENCE
            </div>
            <h1>
              Production support,
              <br />
              <span>with evidence.</span>
            </h1>
            <p>
              Investigate service incidents, inspect diagnostic evidence, and
              track resolution from one workspace.
            </p>
          </div>

          <div className="hero-orbit" aria-hidden="true">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <div className="orbit-core">
              <span className="core-cross">✳</span>
            </div>
            <span className="orbit-node orbit-node-one" />
            <span className="orbit-node orbit-node-two" />
            <span className="orbit-node orbit-node-three" />
          </div>
        </section>

        {error && (
          <div className="alert alert-error" role="alert">
            <span className="alert-icon">!</span>
            <span>{error}</span>
            <button
              className="alert-dismiss"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="alert alert-success" role="status">
            <span className="alert-icon">✓</span>
            <span>{notice}</span>
            <button
              className="alert-dismiss"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        <section className="stats-grid" aria-label="Incident summary">
          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-label">TOTAL INCIDENTS</span>
              <span className="stat-icon stat-icon-purple">▤</span>
            </div>
            <div className="stat-value">{history.length}</div>
            <div className="stat-foot">Recorded in incident history</div>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-label">OPEN INCIDENTS</span>
              <span className="stat-icon stat-icon-amber">◷</span>
            </div>
            <div className="stat-value">{openCount}</div>
            <div className="stat-foot">Awaiting resolution</div>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span className="stat-label">RESOLVED</span>
              <span className="stat-icon stat-icon-green">✓</span>
            </div>
            <div className="stat-value">{resolvedCount}</div>
            <div className="stat-foot">Marked resolved by an operator</div>
          </article>

          <article className="stat-card stat-card-feature">
            <div className="stat-top">
              <span className="stat-label">INVESTIGATION</span>
              <span className="stat-icon stat-icon-blue">⌁</span>
            </div>
            <div className="stat-value stat-value-text">
              {investigating ? "Running" : result ? "Complete" : "Ready"}
            </div>
            <div className="stat-foot">
              <span className="mini-status-dot" />
              {investigating
                ? "Collecting diagnostics"
                : "Ready for an investigation"}
            </div>
          </article>
        </section>

        <section className="main-grid">
          <article className="panel investigate-panel">
            <PanelHeading
              eyebrow="01 / DIAGNOSTICS"
              title="Investigate an incident"
              description="Describe the service and issue you want to inspect."
              action={<span className="tag">AI ASSISTED</span>}
            />

            <form onSubmit={handleInvestigate} className="investigation-form">
              <label className="field">
                <span className="field-label">TARGET SERVICE</span>
                <span className="field-hint">
                  Choose the service to investigate
                </span>
                <select
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                >
                  <option value="payment-service">Payment Service</option>
                  <option value="api-service">API Service</option>
                  <option value="mongodb">MongoDB</option>
                  <option value="kafka-consumer">Kafka</option>
                  <option value="order-service">Order Service</option>
                  <option value="user-service">User Service</option>
                </select>
              </label>

              <label className="field">
                <span className="field-label">INCIDENT DESCRIPTION</span>
                <span className="field-hint">What are you observing?</span>
                <textarea
                  value={problem}
                  onChange={(event) => setProblem(event.target.value)}
                  rows={5}
                  required
                  placeholder="Example: Payment requests are failing with intermittent timeouts..."
                />
              </label>

              <div className="form-note">
                <span className="note-symbol">ⓘ</span>
                <p>
                  Findings are based on the evidence returned by connected
                  diagnostic tools. Unknown causes will be reported as unknown.
                </p>
              </div>

              <div className="form-actions">
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={investigating}
                >
                  {investigating ? (
                    <>
                      <span className="spinner" /> Investigating...
                    </>
                  ) : (
                    <>
                      Run investigation <span className="button-arrow">↗</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </article>

          <article className="panel result-panel">
            <PanelHeading
              eyebrow="02 / ANALYSIS"
              title="Investigation results"
              description="Review the diagnosis and observed evidence."
              action={
                <span
                  className={`result-indicator ${result ? "result-indicator-active" : ""}`}
                >
                  <span />
                  {result ? "RESULT AVAILABLE" : "AWAITING RUN"}
                </span>
              }
            />

            {!result && !investigating && (
              <div className="empty-result">
                <div className="empty-illustration">
                  <div className="empty-illustration-ring" />
                  <span>⌕</span>
                </div>
                <h3>No investigation yet</h3>
                <p>
                  Choose a service and run an investigation. Results will appear
                  here when the backend responds.
                </p>
                <div className="empty-steps">
                  <span><b>01</b> Select service</span>
                  <span><b>02</b> Run diagnostics</span>
                  <span><b>03</b> Review evidence</span>
                </div>
              </div>
            )}

            {investigating && (
              <div className="loading-result">
                <span className="loading-ring" />
                <h3>Investigating service</h3>
                <p>Waiting for diagnostic tools and AI analysis...</p>
              </div>
            )}

            {result && !investigating && (
              <div className="result-content">
                <div className="diagnosis-banner">
                  <div className="diagnosis-banner-top">
                    <span className="diagnosis-label">DIAGNOSIS STATUS</span>
                    <span
                      className={`diagnosis-state state-${diagnosisStatus.toLowerCase()}`}
                    >
                      <span />
                      {diagnosisStatus}
                    </span>
                  </div>
                  <p className="diagnosis-text">
                    {readableDiagnosis(result.diagnosis)}
                  </p>
                </div>

                <div className="result-grid">
                  <div className="result-card">
                    <div className="result-card-heading">
                      <span className="result-card-icon">⌁</span>
                      <span>Observed evidence</span>
                    </div>
                    {evidence ? (
                      <>
                        <h3>{evidence.title}</h3>
                        <p>{evidence.finding}</p>
                        <div className="evidence-details">
                          <div className="evidence-row">
                            <span>Status</span>
                            <strong>{evidence.status}</strong>
                          </div>
                          {evidence.details.map((item) => (
                            <div className="evidence-detail" key={item}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="muted">
                        No structured evidence was returned for this
                        investigation. Check the backend response for available
                        diagnostic details.
                      </p>
                    )}
                  </div>

                  <div className="result-card">
                    <div className="result-card-heading">
                      <span className="result-card-icon">✳</span>
                      <span>AI analysis</span>
                    </div>
                    <div className="markdown-content">
                      <FormattedAnalysis
                        text={
                          result.ai_analysis ??
                          "No additional AI analysis was returned."
                        }
                      />
                    </div>
                    <div className="evidence-footnote">
                      <span className="note-symbol">ⓘ</span>
                      AI analysis is advisory; verify findings before making
                      production changes.
                    </div>
                  </div>
                </div>

                {result.memory_used && result.memory_used.length > 0 && (
                  <details className="memory-details">
                    <summary>
                      Investigation context
                      <span>{result.memory_used.length} item(s)</span>
                    </summary>
                    <pre>{JSON.stringify(result.memory_used, null, 2)}</pre>
                  </details>
                )}

                {selected && (
                  <div className="selected-incident">
                    <div>
                      <span className="field-label">SAVED INCIDENT</span>
                      <p>{selected.id || "Incident ID not returned"}</p>
                    </div>
                    <StatusPill status={selected.status} />
                  </div>
                )}
              </div>
            )}
          </article>
        </section>

        <section className="panel history-panel">
          <PanelHeading
            eyebrow="03 / INCIDENT MANAGEMENT"
            title="Incident history"
            description="Review previous investigations and manage their status."
            action={
              <button
                className="button button-secondary button-small"
                onClick={() => void loadHistory()}
                disabled={loadingHistory}
              >
                <span
                  className={
                    loadingHistory ? "refresh-icon spinning" : "refresh-icon"
                  }
                >
                  ↻
                </span>
                Refresh
              </button>
            }
          />

          {selected && (
            <div className="resolution-panel">
              <div className="resolution-header">
                <div>
                  <div className="eyebrow">SELECTED INCIDENT</div>
                  <h3>{selected.service}</h3>
                  <p>{selected.problem}</p>
                </div>
                <StatusPill status={selected.status} />
              </div>

              {!isResolved(selected.status) ? (
                <form className="resolution-form" onSubmit={handleResolve}>
                  <label className="field">
                    <span className="field-label">ROOT CAUSE</span>
                    <textarea
                      value={rootCause}
                      onChange={(event) => setRootCause(event.target.value)}
                      rows={2}
                      minLength={3}
                      required
                      placeholder="Enter the confirmed cause, or state that the cause remains unconfirmed..."
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">RESOLUTION</span>
                    <textarea
                      value={resolutionNotes}
                      onChange={(event) =>
                        setResolutionNotes(event.target.value)
                      }
                      rows={2}
                      minLength={3}
                      required
                      placeholder="Describe the action taken or the follow-up required..."
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">VERIFICATION NOTES</span>
                    <textarea
                      value={verificationNotes}
                      onChange={(event) =>
                        setVerificationNotes(event.target.value)
                      }
                      rows={2}
                      minLength={3}
                      required
                      placeholder="Describe how the outcome was verified..."
                    />
                  </label>

                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={resolving}
                  >
                    {resolving ? "Saving..." : "Mark as resolved"}
                  </button>
                </form>
              ) : (
                <div className="resolved-note">
                  <span>✓</span> This incident is marked as resolved.
                  <p>
                    <strong>Root cause:</strong>{" "}
                    {selected.root_cause ?? rootCause ?? "Not recorded"}
                  </p>
                  <p>
                    <strong>Resolution:</strong>{" "}
                    {selected.resolution ??
                      selected.resolution_notes ??
                      resolutionNotes ??
                      "Not recorded"}
                  </p>
                  <p>
                    <strong>Verification:</strong>{" "}
                    {selected.verification_notes ??
                      verificationNotes ??
                      "Not recorded"}
                  </p>
                </div>
              )}
            </div>
          )}

          {loadingHistory && history.length === 0 ? (
            <div className="table-empty">
              <span className="spinner" />
              Loading incident history...
            </div>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">▤</div>
              <h3>No incidents recorded</h3>
              <p>Run your first investigation to create an incident record.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="incident-table">
                <thead>
                  <tr>
                    <th>Service / Incident</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="table-actions-heading">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((incident) => (
                    <tr
                      key={
                        incident.id ||
                        `${incident.service}-${incident.created_at}`
                      }
                      className={
                        selected?.id === incident.id ? "selected-row" : ""
                      }
                    >
                      <td>
                        <button
                          className="incident-select"
                          type="button"
                          onClick={() => selectIncident(incident)}
                          title="View incident details"
                        >
                          <span className="incident-service">
                            {incident.service}
                          </span>
                          <span className="incident-problem">
                            {incident.problem}
                          </span>
                          <span className="incident-id">
                            {incident.id || "No incident ID"}
                          </span>
                        </button>
                      </td>
                      <td>
                        <StatusPill status={incident.status} />
                      </td>
                      <td className="date-cell">
                        {formatDate(incident.created_at)}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            onClick={() => selectIncident(incident)}
                          >
                            View
                          </button>
                          <button
                            className="button button-danger button-small"
                            type="button"
                            onClick={() => void handleDelete(incident)}
                            disabled={
                              deletingId === incident.id || !incident.id
                            }
                            title="Delete incident"
                          >
                            {deletingId === incident.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="history-footer">
            <span>
              Showing <strong>{history.length}</strong> incident(s)
            </span>
            <span>Review diagnostic evidence before resolving incidents.</span>
          </div>
        </section>

        <footer className="footer">
          <div className="footer-brand">
            <span className="brand-mark brand-mark-small">
              <span /><span /><span /><span />
            </span>
            NEXUS <span className="footer-divider">/</span> AI Production
            Engineer
          </div>
          <span>Evidence first. Human verified.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
