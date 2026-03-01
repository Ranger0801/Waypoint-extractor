import express, { Request } from "express";
import multer from "multer";
// @ts-ignore
import pdf from "pdf-parse";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// --- Parsing Logic ---
const skipPatterns = [
  /ENR 4\.4/i,
  /UNITED KINGDOM AIP/i,
  /CIVIL AVIATION AUTHORITY/i,
  /\d+ (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/i,
  /AIRAC AMDT/i,
  /AMDT \d+\/\d{4}/i,
  /Name-code\s*$/i,
  /designator\s*$/i,
  /Coordinates\s*ATS route/i,
  /FRA Relevance\s*$/i,
  /Remarks/i,
  /^\s*1\s+2\s+3\s+4\s+5\s*$/i,
  /other route\s*$/i,
  /designator\s+other route/i,
  /Name-code\s+Coordinates/i,
  /Coordinates\s+ATS route/i,
  /designator\s+Coordinates/i,
  /^\s*$/i,
  /INTENTIONALLY BLANK/i,
  /ENR 4\.4 NAME-CODE/i,
  /NAME-CODE DESIGNATORS FOR SIGNIFICANT POINTS/i,
  /^\(continued\)/i,
];

function isHeaderOrFooter(line: string) {
  return skipPatterns.some((pat) => pat.test(line.trim()));
}

function isNewRecordStart(line: string) {
  return /^[A-Z]{5}\s/.test(line.trim());
}

interface Waypoint {
  name: string;
  coordinates: string;
  routes: string;
}

function parseText(text: string): Waypoint[] {
  const lines = text.split("\n");
  const filteredLines = lines.filter((line) => !isHeaderOrFooter(line) && line.trim());
  
  const records: string[] = [];
  let current: string | null = null;

  for (const line of filteredLines) {
    if (isNewRecordStart(line)) {
      if (current) records.push(current);
      current = line.trim();
    } else if (current !== null) {
      current += " " + line.trim();
    }
  }
  if (current) records.push(current);

  return records.map((rec) => {
    // Basic extraction: Name is first 5 chars
    const name = rec.substring(0, 5);
    // Look for coordinates pattern: 524312N 0012345W
    const coordMatch = rec.match(/(\d{6}[NS])\s+(\d{7}[EW])/);
    const coordinates = coordMatch ? `${coordMatch[1]} ${coordMatch[2]}` : "Unknown";
    const routes = rec.replace(name, "").replace(coordinates, "").trim();
    
    return { name, coordinates, routes };
  });
}

// --- API Endpoints ---

app.post("/api/upload", upload.single("file"), async (req: Request, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const data = await pdf(req.file.buffer);
    const waypoints = parseText(data.text);
    res.json({ waypoints });
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
