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

      await page.setViewport({ width: 794, height: 1123 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.evaluateHandle("document.fonts.ready");

      const pdf = await page.pdf({
        format,
        printBackground: true,
        margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
        preferCSSPageSize: false,
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
