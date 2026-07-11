import puppeteer from "@cloudflare/puppeteer";

export interface Env {
  BROWSER: Fetcher;
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";

    const allowedList = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const devOrigins = [
      "http://localhost:5173",
      "http://localhost:5000",
      "http://localhost:3000",
      "http://localhost:4173",
    ];

    const allAllowed = [...allowedList, ...devOrigins];

    const isReplit = origin.endsWith(".replit.dev") || origin.endsWith(".spock.replit.dev");
    const isAllowed = allAllowed.includes(origin) || isReplit;

    const corsOrigin = isAllowed ? origin : (allowedList[0] ?? "*");

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (request.method !== "POST" || url.pathname !== "/pdf") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    let html: string;
    let filename = "cv.pdf";
    let format: "A4" | "Letter" = "A4";

    try {
      const body = (await request.json()) as {
        html?: string;
        filename?: string;
        format?: string;
        expectedPageCount?: number;
      };

      if (!body.html || typeof body.html !== "string") {
        return new Response(JSON.stringify({ error: "html field is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (body.html.length > 2_000_000) {
        return new Response(JSON.stringify({ error: "HTML too large (max 2MB)" }), {
          status: 413,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      html = body.html;
      if (body.filename) filename = body.filename.replace(/[^\w\-_.]/g, "_");
      if (body.format === "Letter") format = "Letter";
      const expectedPageCount: number | undefined = typeof body.expectedPageCount === 'number' ? body.expectedPageCount : undefined;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let browser = null;
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();

      // Width must be >= 800px so the CVPreview mobile-only "swipe to see
      // full CV" hint (Tailwind `min-[800px]:hidden`) stays hidden in the
      // rendered PDF — 794px (A4 @ 96dpi) sits just under that breakpoint
      // and was leaking the hint text into every downloaded PDF.
      await page.setViewport({ width: 800, height: 1123 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.evaluateHandle("document.fonts.ready");

      // ── Sanity check: compare headless scroll height vs live preview ──────
      // If the browser font renderer diverges from Chromium (e.g. different
      // system font hinting), the rendered page count may differ from what the
      // user saw. We log a warning — not an error — so we catch drift early
      // without breaking the download.
      if (expectedPageCount !== undefined) {
        try {
          const A4_PX = 1123;
          const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
          const expectedHeight = A4_PX * expectedPageCount;
          const drift = Math.abs(scrollHeight - expectedHeight) / expectedHeight;
          if (drift > 0.02) {
            console.warn(
              `[resume-pdf-worker] Layout drift detected: live preview expected ${expectedHeight}px (${expectedPageCount}p) ` +
              `but headless Chromium measured ${scrollHeight}px (${(scrollHeight / A4_PX).toFixed(2)}p). ` +
              `Drift: ${(drift * 100).toFixed(1)}% — check for cross-renderer font/hinting differences.`
            );
          }
        } catch (driftErr) {
          // Non-fatal — don't let measurement failures block the PDF.
          console.warn('[resume-pdf-worker] Drift check failed:', driftErr);
        }
      }

      // 0mm margins + preferCSSPageSize:true so the @page rule injected by
      // getCVHtml ("@page { size: A4; margin: 0mm }") wins. The CV templates
      // bring their OWN internal padding (sized for full 210mm width); adding
      // a 0.5in worker margin on top of that compressed every layout — that
      // was the #1 reason "the PDF doesn't match the preview".
      const pdf = await page.pdf({
        format,
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
        preferCSSPageSize: true,
      });

      await browser.close();

      return new Response(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": String(pdf.byteLength),
          ...corsHeaders,
        },
      });
    } catch (err: unknown) {
      if (browser) {
        try {
          await (browser as { close(): Promise<void> }).close();
        } catch {
        }
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PDF generation failed:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
