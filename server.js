const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const flyersDirectory = path.join(__dirname, "flyers");

function getFlyerFiles() {
  if (!fs.existsSync(flyersDirectory)) {
    return [];
  }

  return fs
    .readdirSync(flyersDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".pdf")
    .map((entry) => entry.name)
    .sort((first, second) => first.localeCompare(second));
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/flyers", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ files: getFlyerFiles() });
});

app.get("/download/flyers/:fileName", (req, res) => {
  const fileName = path.basename(String(req.params.fileName || ""));

  if (!getFlyerFiles().includes(fileName)) {
    return res.status(404).json({ message: "Flyer PDF not found." });
  }

  return res.download(path.join(flyersDirectory, fileName), fileName, (error) => {
    if (error && !res.headersSent) {
      console.error("Flyer download failed:", error.message);
      res.status(500).json({ message: "Unable to download the flyer PDF." });
    }
  });
});

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
