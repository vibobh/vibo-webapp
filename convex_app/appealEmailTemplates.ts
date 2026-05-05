/**
 * Branded HTML/text for appeal confirmation — matches OTP/welcome email styling (#4a0315, #e0d9c7).
 */

const PRIMARY = "#4a0315";
const SECONDARY_BG = "#e0d9c7";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getAppealSubmittedEmail(args: {
  username: string;
  reasonPreview: string;
  appealReference: string;
  lang: "en" | "ar";
}): { subject: string; html: string; text: string } {
  const { username, reasonPreview, appealReference, lang } = args;
  const safeName = escapeHtml(username || "there");
  const safeReason = escapeHtml(reasonPreview);
  const safeRef = escapeHtml(appealReference);

  if (lang === "ar") {
    return {
      subject: "تم استلام طلبك — Vibo",
      html: `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تم استلام الطعن</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    body { margin: 0; padding: 0; font-family: 'Noto Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${PRIMARY}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.65; margin-bottom: 24px; }
    .ref-box { background: ${SECONDARY_BG}; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .ref-label { color: #8e8e8e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .ref-id { color: ${PRIMARY}; font-size: 15px; font-weight: 700; word-break: break-all; }
    .reason-box { text-align: right; margin-top: 24px; padding: 20px; background: #fafafa; border-radius: 12px; border: 1px solid #dbdbdb; }
    .reason-label { color: #8e8e8e; font-size: 12px; margin-bottom: 10px; font-weight: 600; }
    .reason-text { color: #262626; font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
    .footer { background: #fafafa; padding: 24px 32px; text-align: center; border-top: 1px solid #dbdbdb; }
    .footer-text { color: #a8a8a8; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vibo</div>
    </div>
    <div class="content">
      <div class="title">مرحباً ${safeName}</div>
      <div class="subtitle">تم استلام طلب الطعن الخاص بك. سيراجع فريقنا طلبك وسنتواصل معك عبر البريد إذا احتجنا لمزيد من التفاصيل.</div>
      <div class="ref-box">
        <div class="ref-label">مرجع الطلب</div>
        <div class="ref-id">${safeRef}</div>
      </div>
      <div class="reason-box">
        <div class="reason-label">نص طلبك</div>
        <div class="reason-text">${safeReason}</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">© 2026 Vibo. جميع الحقوق محفوظة.</div>
    </div>
  </div>
</body>
</html>`,
      text: `مرحباً ${username || "there"}،\n\nتم استلام طلب الطعن. المرجع: ${appealReference}\n\nنص الطلب:\n${reasonPreview}\n\n© 2026 Vibo`,
    };
  }

  return {
    subject: "We received your appeal — Vibo",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appeal received</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${PRIMARY}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.65; margin-bottom: 24px; }
    .ref-box { background: ${SECONDARY_BG}; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .ref-label { color: #8e8e8e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .ref-id { color: ${PRIMARY}; font-size: 15px; font-weight: 700; word-break: break-all; }
    .reason-box { text-align: left; margin-top: 24px; padding: 20px; background: #fafafa; border-radius: 12px; border: 1px solid #dbdbdb; }
    .reason-label { color: #8e8e8e; font-size: 12px; margin-bottom: 10px; font-weight: 600; }
    .reason-text { color: #262626; font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
    .footer { background: #fafafa; padding: 24px 32px; text-align: center; border-top: 1px solid #dbdbdb; }
    .footer-text { color: #a8a8a8; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vibo</div>
    </div>
    <div class="content">
      <div class="title">Hi ${safeName}</div>
      <div class="subtitle">We received your appeal. Our team will review it and will reach out by email if we need anything else.</div>
      <div class="ref-box">
        <div class="ref-label">Reference</div>
        <div class="ref-id">${safeRef}</div>
      </div>
      <div class="reason-box">
        <div class="reason-label">Your message</div>
        <div class="reason-text">${safeReason}</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">© 2026 Vibo. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`,
    text: `Hi ${username || "there"},\n\nWe received your appeal. Reference: ${appealReference}\n\nYour message:\n${reasonPreview}\n\n© 2026 Vibo`,
  };
}
