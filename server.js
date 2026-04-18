require("dotenv").config();

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
const allowedDownloads = new Map([
  ["acceluav-flyers.pdf", path.join(__dirname, "acceluav-flyers.pdf")],
  ["acceluav-profile.pdf", path.join(__dirname, "acceluav-profile.pdf")],
]);

// Set correct MIME type for CSS
app.use((req, res, next) => {
  if (req.path.endsWith('.css')) {
    res.type('text/css');
  } else if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
});

app.use(express.json());
app.use(express.static(__dirname, { 
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get("/download/:filename", (req, res) => {
  const requestedName = String(req.params.filename || "");
  const safeFileName = path.basename(requestedName);
  const filePath = allowedDownloads.get(safeFileName);

  if (!filePath) {
    return res.status(404).json({ message: "Brochure not found." });
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

    try {
      await sendNotificationEmail(row);
      console.log(`Email notification sent for ${fullName}`);
      return res.json({ message: "Contact saved and email sent." });
    } catch (emailError) {
      console.error("Email send failed:", emailError.message);
      return res.status(500).json({ message: `Email error: ${emailError.message}` });
    }
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
