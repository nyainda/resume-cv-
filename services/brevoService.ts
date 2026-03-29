// services/brevoService.ts
// Sends transactional emails through the Brevo (formerly Sendinblue) REST API.
// Docs: https://developers.brevo.com/reference/sendtransacemail
//
// Important notes for users:
//  1. The sender email (userEmail) MUST be verified in your Brevo account, OR
//     you must use a Brevo-verified sending domain.
//  2. Free Brevo accounts allow 300 emails/day.
//  3. The API key is stored locally in the browser — never sent to any server
//     other than api.brevo.com itself.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoSender {
    name: string;
    email: string;
}

export interface BrevoRecipient {
    name?: string;
    email: string;
}

export interface BrevoAttachment {
    /** File name shown in the email (e.g. "John_Doe_CV.pdf") */
    name: string;
    /** Base64-encoded file content */
    content: string;
}

export interface BrevoSendParams {
    apiKey: string;
    sender: BrevoSender;
    to: BrevoRecipient[];
    subject: string;
    /** Plain-text body (always provided as fallback) */
    textContent: string;
    /** Optional HTML body — renders nicely in modern clients */
    htmlContent?: string;
    /** Optional reply-to (defaults to sender) */
    replyTo?: BrevoSender;
    attachments?: BrevoAttachment[];
}

export interface BrevoSendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Send a transactional email via Brevo API.
 * Returns { success: true, messageId } or { success: false, error }
 */
export async function sendEmailViaBrevo(params: BrevoSendParams): Promise<BrevoSendResult> {
    const {
        apiKey,
        sender,
        to,
        subject,
        textContent,
        htmlContent,
        replyTo,
        attachments,
    } = params;

    if (!apiKey?.trim()) {
        return { success: false, error: 'No Brevo API key configured. Add it in Settings → Brevo.' };
    }

    const body: Record<string, unknown> = {
        sender,
        to,
        subject,
        textContent,
    };

    if (htmlContent) body.htmlContent = htmlContent;
    if (replyTo) body.replyTo = replyTo;
    if (attachments?.length) body.attachment = attachments;

    try {
        const res = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': apiKey.trim(),
            },
            body: JSON.stringify(body),
        });

        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return { success: true, messageId: data.messageId ?? 'sent' };
        }

        // Parse Brevo error body
        let errMsg = `Brevo API error (${res.status})`;
        try {
            const errData = await res.json();
            errMsg = errData.message ?? errData.error ?? errMsg;
        } catch { /* ignore */ }

        return { success: false, error: errMsg };
    } catch (err) {
        return { success: false, error: (err as Error).message ?? 'Network error contacting Brevo' };
    }
}

/**
 * Build a professional HTML email body from plain text.
 * Wraps the text in a clean, readable template.
 */
export function buildHtmlEmail(params: {
    senderName: string;
    recipientEmail: string;
    subject: string;
    textBody: string;
    coverLetterText?: string;
}): string {
    const { senderName, subject, textBody, coverLetterText } = params;

    const formatSection = (title: string, content: string) => `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:14px;font-weight:700;color:#4f46e5;text-transform:uppercase;
                 letter-spacing:0.05em;border-bottom:2px solid #e0e7ff;padding-bottom:8px;
                 margin-bottom:12px;">${title}</h2>
      <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">${content}</div>
    </div>
  `;

    const coverLetterSection = coverLetterText
        ? formatSection('Cover Letter', coverLetterText)
        : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:12px;
              overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                padding:28px 32px;color:#ffffff;">
      <h1 style="margin:0;font-size:20px;font-weight:800;letter-spacing:-0.02em;">${subject}</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">From ${senderName} · via AI CV Builder</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      ${coverLetterSection}
      ${formatSection('Email Message', textBody)}
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;
                font-size:11px;color:#94a3b8;text-align:center;">
      Sent automatically via AI CV Builder · Powered by Brevo
    </div>
  </div>
</body>
</html>`.trim();
}
