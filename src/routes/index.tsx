import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RealDoor — Application Readiness Copilot" },
      {
        name: "description",
        content:
          "Check your rental application readiness in seconds. Upload documents, get an instant readiness score, and generate a landlord-ready packet.",
      },
      { property: "og:title", content: "RealDoor — Application Readiness Copilot" },
      {
        property: "og:description",
        content: "Instant rental application readiness scoring and packet generation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: Index,
});

type Status = "complete" | "issue" | "missing";
type DocKey = "id" | "payslips" | "income" | "bank" | "reference";

interface DocItem {
  key: DocKey;
  label: string;
  description: string;
  multi?: number;
}

const DOCS: DocItem[] = [
  { key: "id", label: "Government ID", description: "Passport, driver's license, or national ID" },
  { key: "payslips", label: "Payslips", description: "Last 3 months", multi: 3 },
  { key: "income", label: "Income Proof", description: "Employment letter or contract" },
  { key: "bank", label: "Bank Statement", description: "Last 3 months of statements" },
  { key: "reference", label: "Reference Letter", description: "Previous landlord or employer" },
];

interface DocState {
  files: File[];
  status: Status;
  reason: string;
  incomeMultiple?: number; // for income vs rent
}

const ISSUE_REASONS: Record<DocKey, string[]> = {
  id: [
    "Image is blurry — retake in good lighting so all corners are visible.",
    "ID appears to be expired — upload a current, unexpired document.",
  ],
  payslips: [
    "Only 2 of 3 payslips detected — add the most recent month to complete the set.",
    "One payslip is missing employer details — upload the full page including the header.",
  ],
  income: [
    "Employment letter is undated — request a version dated within the last 30 days.",
    "Letter doesn't state gross annual salary — ask HR to include it explicitly.",
  ],
  bank: [
    "Statement covers only 1 month — landlords typically expect 3 months of history.",
    "Account holder name is cut off — re-upload including the full statement header.",
  ],
  reference: [
    "Reference is missing contact info — add a phone number or verified email.",
    "Reference is over 12 months old — request a recent letter from your current landlord.",
  ],
};

const MISSING_REASONS: Record<DocKey, string> = {
  id: "Upload a clear photo of a valid government-issued ID (both sides if applicable).",
  payslips: "Upload your last 3 monthly payslips — PDFs from your payroll portal work best.",
  income: "Ask your employer for a signed letter confirming your role, salary, and start date.",
  bank: "Download the last 3 months of statements from your bank as PDFs and upload them here.",
  reference: "Request a short letter from your current landlord or employer confirming reliability.",
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function Index() {
  const [rent, setRent] = useState<string>("");
  const [docs, setDocs] = useState<Record<DocKey, DocState>>({
    id: { files: [], status: "missing", reason: MISSING_REASONS.id },
    payslips: { files: [], status: "missing", reason: MISSING_REASONS.payslips },
    income: { files: [], status: "missing", reason: MISSING_REASONS.income },
    bank: { files: [], status: "missing", reason: MISSING_REASONS.bank },
    reference: { files: [], status: "missing", reason: MISSING_REASONS.reference },
  });

  const handleFiles = (key: DocKey, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const doc = DOCS.find((d) => d.key === key)!;

    // Simulated AI: weighted random status
    const roll = Math.random();
    let status: Status;
    if (doc.multi && files.length < doc.multi) {
      status = "issue";
    } else {
      status = roll < 0.6 ? "complete" : roll < 0.9 ? "issue" : "missing";
    }

    let reason = "";
    let incomeMultiple: number | undefined;

    if (status === "complete") {
      if (key === "income" || key === "payslips") {
        // simulate detected income
        const monthlyRent = parseFloat(rent) || 0;
        const mult = 2.5 + Math.random() * 2; // 2.5x - 4.5x
        incomeMultiple = mult;
        if (monthlyRent > 0 && mult < 3) {
          status = "issue";
          reason = `Detected income is ~${mult.toFixed(1)}× rent. Most landlords want 3×+ — consider adding a co-signer or additional income proof.`;
        } else {
          reason =
            key === "payslips"
              ? `All 3 payslips look clean and consistent (≈${mult.toFixed(1)}× rent).`
              : `Employment letter verified. Stated income ≈${mult.toFixed(1)}× rent.`;
        }
      } else {
        reason = "Looks good — clear, current, and complete.";
      }
    } else if (status === "issue") {
      reason = pickRandom(ISSUE_REASONS[key]);
    } else {
      reason = MISSING_REASONS[key];
    }

    setDocs((prev) => ({
      ...prev,
      [key]: { files, status, reason, incomeMultiple },
    }));
  };

  const clearDoc = (key: DocKey) => {
    setDocs((prev) => ({
      ...prev,
      [key]: { files: [], status: "missing", reason: MISSING_REASONS[key] },
    }));
  };

  const score = useMemo(() => {
    const weights: Record<Status, number> = { complete: 20, issue: 10, missing: 0 };
    return Object.values(docs).reduce((sum, d) => sum + weights[d.status], 0);
  }, [docs]);

  const hasAnyUpload = Object.values(docs).some((d) => d.files.length > 0);

  const generatePDF = () => {
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    let y = 50;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("RealDoor Application Packet", 50, y);
    y += 28;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(90);
    pdf.text(`Generated ${new Date().toLocaleString()}`, 50, y);
    y += 24;

    pdf.setDrawColor(200);
    pdf.line(50, y, pageW - 50, y);
    y += 24;

    pdf.setTextColor(30);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Summary", 50, y);
    y += 20;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(`Monthly rent: ${rent ? `$${rent}` : "Not specified"}`, 50, y);
    y += 16;
    pdf.text(`Readiness score: ${score}/100`, 50, y);
    y += 28;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Documents", 50, y);
    y += 20;

    DOCS.forEach((doc) => {
      const d = docs[doc.key];
      const icon =
        d.status === "complete" ? "[OK]" : d.status === "issue" ? "[!]" : "[X]";
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(`${icon} ${doc.label}`, 50, y);
      y += 15;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(90);
      const lines = pdf.splitTextToSize(d.reason, pageW - 100);
      pdf.text(lines, 60, y);
      y += lines.length * 13;
      if (d.files.length > 0) {
        const fileNames = d.files.map((f) => f.name).join(", ");
        const fLines = pdf.splitTextToSize(`Files: ${fileNames}`, pageW - 100);
        pdf.text(fLines, 60, y);
        y += fLines.length * 13;
      }
      pdf.setTextColor(30);
      y += 10;
      if (y > 750) {
        pdf.addPage();
        y = 50;
      }
    });

    pdf.save("realdoor-application-packet.pdf");
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 md:py-16">
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-success" />
          RealDoor · Application Readiness Copilot
        </div>
        <h1 className="text-4xl font-semibold text-foreground md:text-5xl">
          Land the rental. <span className="text-primary">Skip the scramble.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Upload your documents and get an instant readiness score — plus specific,
          plain-English fixes before a landlord ever sees your file.
        </p>
      </header>

      {/* Rent input */}
      <section className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <label htmlFor="rent" className="text-sm font-medium text-foreground">
          Monthly rent
        </label>
        <p className="text-xs text-muted-foreground">
          We'll compare your income against this to flag common landlord thresholds.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-lg text-muted-foreground">$</span>
          <input
            id="rent"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="2400"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-lg font-semibold text-foreground outline-none ring-ring focus:ring-2"
          />
          <span className="text-sm text-muted-foreground">/ month</span>
        </div>
      </section>

      {/* Uploads */}
      <section className="mb-8 grid gap-4 md:grid-cols-2">
        {DOCS.map((doc) => {
          const state = docs[doc.key];
          return <UploadCard key={doc.key} doc={doc} state={state} onFiles={handleFiles} onClear={clearDoc} />;
        })}
      </section>

      {/* Score + checklist */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
          <ScoreCircle score={score} active={hasAnyUpload} />
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              {hasAnyUpload ? scoreHeadline(score) : "Upload documents to see your score"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasAnyUpload
                ? "Fix the flagged items below to raise your score before submitting."
                : "Your readiness score updates in real time as you upload each file."}
            </p>
          </div>
        </div>

        <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-background">
          {DOCS.map((doc) => {
            const d = docs[doc.key];
            return <ChecklistRow key={doc.key} doc={doc} state={d} />;
          })}
        </ul>

        <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            Simulated review — no documents leave your device.
          </p>
          <button
            onClick={generatePDF}
            disabled={!hasAnyUpload}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate Application Packet
            <span aria-hidden>→</span>
          </button>
        </div>
      </section>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        Built with RealDoor · Your rental readiness copilot
      </footer>
    </main>
  );
}

function scoreHeadline(score: number) {
  if (score >= 90) return "You're application-ready.";
  if (score >= 70) return "Almost there — a couple of fixes to go.";
  if (score >= 40) return "Getting there. Address the flagged items.";
  return "Let's build a stronger application.";
}

function UploadCard({
  doc,
  state,
  onFiles,
  onClear,
}: {
  doc: DocItem;
  state: DocState;
  onFiles: (key: DocKey, files: FileList | null) => void;
  onClear: (key: DocKey) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFiles = state.files.length > 0;
  const borderColor =
    state.status === "complete"
      ? "border-success/50"
      : state.status === "issue"
        ? "border-warning/60"
        : "border-border";

  return (
    <div className={`group rounded-2xl border-2 border-dashed ${borderColor} bg-card p-5 transition hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{doc.label}</h3>
          <p className="text-xs text-muted-foreground">{doc.description}</p>
        </div>
        <StatusPill status={hasFiles ? state.status : "missing"} short />
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={!!doc.multi}
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => onFiles(doc.key, e.target.files)}
      />

      {hasFiles ? (
        <div className="mt-4 space-y-2">
          <ul className="space-y-1">
            {state.files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="truncate">{f.name}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              Replace
            </button>
            <button
              onClick={() => onClear(doc.key)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-4 w-full rounded-lg bg-secondary py-3 text-sm font-medium text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          + Upload {doc.multi ? `${doc.multi} files` : "file"}
        </button>
      )}
    </div>
  );
}

function ChecklistRow({ doc, state }: { doc: DocItem; state: DocState }) {
  const showTip = state.status !== "complete";
  return (
    <li className="flex items-start gap-4 p-4">
      <StatusIcon status={state.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{doc.label}</span>
          <StatusPill status={state.status} />
        </div>
        {showTip && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Tip: </span>
            {state.reason}
          </p>
        )}
        {!showTip && (
          <p className="mt-1 text-sm text-muted-foreground">{state.reason}</p>
        )}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "complete")
    return (
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-success/15 text-success">
        ✓
      </div>
    );
  if (status === "issue")
    return (
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-warning/20 text-warning">
        !
      </div>
    );
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-destructive/15 text-destructive">
      ✕
    </div>
  );
}

function StatusPill({ status, short = false }: { status: Status; short?: boolean }) {
  const map = {
    complete: { label: short ? "Complete" : "✅ Complete", cls: "bg-success/15 text-success" },
    issue: { label: short ? "Issue" : "⚠️ Issue", cls: "bg-warning/20 text-warning" },
    missing: { label: short ? "Missing" : "❌ Missing", cls: "bg-destructive/15 text-destructive" },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map.cls}`}>
      {map.label}
    </span>
  );
}

function ScoreCircle({ score, active }: { score: number; active: boolean }) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const shown = active ? score : 0;
  const offset = circumference - (shown / 100) * circumference;
  const color =
    shown >= 80 ? "var(--success)" : shown >= 40 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="relative mx-auto h-40 w-40 md:mx-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} strokeWidth="12" className="fill-none stroke-muted" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          strokeWidth="12"
          strokeLinecap="round"
          className="fill-none transition-all duration-700 ease-out"
          style={{ stroke: active ? color : "var(--muted)", strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-semibold text-foreground">{shown}</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Readiness</span>
      </div>
    </div>
  );
}
