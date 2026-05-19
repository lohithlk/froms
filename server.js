require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3000;

const resendApiKey = process.env.RESEND_API_KEY || "";
const adminEmail = process.env.ADMIN_EMAIL || "";
const senderEmail = process.env.SENDER_EMAIL || "noreply@acceluav.com";
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const brochureAccessCookieName = "brochure_access";
const brochureAccessMaxAgeMs = 1000 * 60 * 60 * 24 * 365;
const brochureAccessSecret =
  process.env.BROCHURE_ACCESS_SECRET || "acceluav-brochure-access-secret";
const allowedDownloads = new Map([
  ["acceluav-flyers.pdf", path.join(__dirname, "acceluav-flyers.pdf")],
  ["acceluav-profile.pdf", path.join(__dirname, "acceluav-profile.pdf")],
]);

function createBrochureAccessToken() {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Date.now() + brochureAccessMaxAgeMs,
    }),
    "utf8",
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", brochureAccessSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function parseCookieHeader(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function verifyBrochureAccessToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [payload, providedSignature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", brochureAccessSecret)
    .update(payload)
    .digest("base64url");

  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const decodedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );

    return Number(decodedPayload.exp) > Date.now();
  } catch (error) {
    return false;
  }
}

function hasBrochureAccess(req) {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return verifyBrochureAccessToken(cookies[brochureAccessCookieName]);
}

function grantBrochureAccess(res) {
  res.cookie(brochureAccessCookieName, createBrochureAccessToken(), {
    httpOnly: true,
    maxAge: brochureAccessMaxAgeMs,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/styles.css", (req, res) => {
  res.sendFile(path.join(__dirname, "styles.css"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});

app.use("/brochures", express.static(path.join(__dirname, "brochures")));

app.get("/api/brochure-access", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ granted: hasBrochureAccess(req) });
});

app.get("/download/:filename", (req, res) => {
  const requestedName = String(req.params.filename || "");
  const safeFileName = path.basename(requestedName);
  const filePath = allowedDownloads.get(safeFileName);

  if (!filePath) {
    return res.status(404).json({ message: "Brochure not found." });
  }

  if (!hasBrochureAccess(req)) {
    return res.status(403).json({
      message: "Please fill out the form once to unlock brochure downloads.",
    });
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Download file missing in runtime: ${filePath}`);
    return res.status(404).json({ message: "Brochure file is not available on server." });
  }

  return res.download(filePath, safeFileName, (error) => {
    if (error && !res.headersSent) {
      console.error("Download start failed:", error.message);
      return res.status(500).json({ message: "Failed to start download." });
    }
    return undefined;
  });
});

async function sendNotificationEmail(row) {
  if (!resend || !adminEmail) {
    throw new Error("Email service not configured. Check RESEND_API_KEY and ADMIN_EMAIL in .env");
  }

  const emailBody = `
New Brochure Request Submitted

Date: ${row["Date"]}
Time: ${row["Time"]}

Full Name: ${row["Full Name"]}
Company Name: ${row["Company Name"]}
Email: ${row["Email"]}
Phone: ${row["Phone"]}
Brochure Downloaded: ${row["Brochure Downloaded"]}

Please respond to the contact at the email address above.
  `.trim();

  const result = await resend.emails.send({
    from: senderEmail,
    to: adminEmail,
    subject: `New Brochure Request from ${row["Full Name"]}`,
    text: emailBody,
  });

  if (!result || result.error) {
    throw new Error(`Resend failed: ${result?.error?.message || "Unknown error"}`);
  }

  return result;
}

app.post("/api/contacts", async (req, res) => {
  try {
    const { fullName, companyName, email, phone, brochureTitle, brochureFile } = req.body || {};

    if (!fullName || !companyName || !email || !phone || !brochureTitle || !brochureFile) {
      return res.status(400).json({ message: "Missing required form fields." });
    }

    const now = new Date();
    const fallbackBrochure = decodeURIComponent(String(brochureFile || ""));
    const row = {
      "Date": now.toLocaleDateString("en-GB"),
      "Time": now.toLocaleTimeString("en-GB"),
      "Full Name": fullName,
      "Company Name": companyName,
      "Email": email,
      "Phone": phone,
      "Brochure Downloaded": brochureTitle || fallbackBrochure,
    };

    let warning = "";

    try {
      await sendNotificationEmail(row);
      console.log(`Email notification sent for ${fullName}`);
    } catch (emailError) {
      console.error("Email send failed:", emailError.message);
      warning = `Notification email issue: ${emailError.message}`;
    }

    grantBrochureAccess(res);

    return res.json({
      message: "Thanks. Your brochure access is unlocked.",
      warning,
    });
  } catch (error) {
    console.error("Contact submission failed:", error.message);
    return res.status(500).json({ message: "Failed to process contact." });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Email service: ${resend ? "ENABLED" : "DISABLED"}`);
    console.log(`From: ${senderEmail}`);
    console.log(`To: ${adminEmail}`);
  });
}

module.exports = app;
