import express from "express";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// Serve generated question files for download
app.use("/questions", express.static(path.join(__dirname, "questions")));

const runs = new Map();

function makeId() {
  return randomBytes(6).toString("hex");
}

app.post("/api/run", (req, res) => {
  const body = req.body || {};
  const action = (body.cmd || "generate").toString();
  if (!["generate", "create", "generate_and_create", "login"].includes(action)) {
    return res
      .status(400)
      .json({ error: "cmd must be generate, create, generate_and_create or login" });
  }

  const id = makeId();
  const run = {
    procs: [],
    lines: [],
    clients: new Set(),
    finished: false,
    savedFile: null,
  };
  runs.set(id, run);

  const makePush = (run) => (line) => {
    const text = String(line).replace(/\r/g, "\n");
    const parts = text.split("\n");
    for (const p of parts) {
      if (!p) continue;
      run.lines.push(p);
      // detect saved questions file from CLI: "Questions saved → <path>"
      const m = p.match(/Questions saved\s*→\s*(.+)$/);
      if (m) {
        const filePath = m[1].trim();
        run.savedFile = filePath.replace(/^\.\//, "");
        for (const res of run.clients) {
          try {
            res.write(`data: SAVED_FILE: ${run.savedFile}\n\n`);
          } catch (e) {}
        }
      }
      if (run.lines.length > 1000) run.lines.shift();
      for (const res of run.clients) {
        try {
          res.write(`data: ${p.replace(/\n/g, "\\n")}\n\n`);
        } catch (e) {}
      }
    }
  };

  const spawnProcess = (cmdArgs, opts = {}) => {
    const proc = spawn("node", cmdArgs, { cwd: __dirname, env: process.env });
    run.procs.push(proc);
    const push = makePush(run);
    proc.stdout.on("data", (d) => push(d.toString()));
    proc.stderr.on("data", (d) => push(d.toString()));
    proc.on("close", (code) => {
      // If this was the last proc, finish
      if (opts.onClose) opts.onClose(code);
    });
    // optionally auto-confirm by writing newline
    if (opts.autoConfirm) {
      setTimeout(() => {
        try {
          proc.stdin.write("\n");
        } catch (e) {}
      }, opts.autoConfirmDelay || 500);
    }
    // announce phase start if provided
    if (opts.phaseName) {
      const marker = `PHASE: ${opts.phaseName}: start`;
      run.lines.push(marker);
      for (const res of run.clients) {
        try {
          res.write(`data: ${marker}\n\n`);
        } catch (e) {}
      }
    }
    return proc;
  };

  (async () => {
    try {
      if (action === "login") {
        spawnProcess(["src/index.js", "login"]);
      } else if (action === "generate") {
        // spawn single generate
        const args = ["src/index.js", "generate"];
        const genAllowed = [
          "prompt",
          "source",
          "title",
          "count",
          "model",
          "saveQuestions",
        ];
        for (const key of genAllowed) {
          if (
            body[key] !== undefined &&
            body[key] !== null &&
            String(body[key]) !== ""
          ) {
            const flag =
              key === "saveQuestions"
                ? "--save-questions"
                : `--${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;
            args.push(flag);
            args.push(String(body[key]));
          }
        }
        spawnProcess(args);
      } else if (action === "create") {
        const args = ["src/index.js", "create"];
        const createAllowed = [
          "prompt",
          "source",
          "title",
          "count",
          "model",
          "loadQuestions",
          "url",
          "headless",
        ];
        for (const key of createAllowed) {
          if (
            body[key] !== undefined &&
            body[key] !== null &&
            String(body[key]) !== ""
          ) {
            const flag =
              key === "loadQuestions"
                ? "--load-questions"
                : `--${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;
            args.push(flag);
            args.push(String(body[key]));
          }
        }
        spawnProcess(args, {
          autoConfirm: !!body.autoConfirm,
          autoConfirmDelay: 500,
        });
      } else if (action === "generate_and_create") {
        // 1) generate
        const args1 = ["src/index.js", "generate"];
        const genAllowed = [
          "prompt",
          "source",
          "title",
          "count",
          "model",
          "saveQuestions",
        ];
        for (const key of genAllowed) {
          if (
            body[key] !== undefined &&
            body[key] !== null &&
            String(body[key]) !== ""
          ) {
            const flag =
              key === "saveQuestions"
                ? "--save-questions"
                : `--${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;
            args1.push(flag);
            args1.push(String(body[key]));
          }
        }

        spawnProcess(args1, {
          onClose: async () => {
            // after generation finished, check savedFile
            if (!run.savedFile) {
              // notify clients
              for (const res of run.clients) {
                try {
                  res.write(`data: ERROR: no generated file detected\n\n`);
                } catch (e) {}
              }
              // finish
              const doneMsg = `__PROCESS_END__ exit=1`;
              run.lines.push(doneMsg);
              for (const res of run.clients) {
                try {
                  res.write(`data: ${doneMsg}\n\n`);
                  res.end();
                } catch (e) {}
              }
              run.finished = true;
              return;
            }

            // 2) spawn create using saved file
            const args2 = [
              "src/index.js",
              "create",
              "--load-questions",
              run.savedFile,
            ];
            if (body.title) {
              args2.push("--title");
              args2.push(String(body.title));
            }
            if (body.url) {
              args2.push("--url");
              args2.push(String(body.url));
            }
            if (body.model) {
              args2.push("--model");
              args2.push(String(body.model));
            }
            if (body.headless) {
              args2.push("--headless");
            }

            spawnProcess(args2, {
              phaseName: "create",
              autoConfirm: !!body.autoConfirm,
              autoConfirmDelay: 500,
              onClose: (code) => {
                const doneMsg = `__PROCESS_END__ exit=${code}`;
                run.lines.push(doneMsg);
                for (const res of run.clients) {
                  try {
                    res.write(`data: ${doneMsg}\n\n`);
                  } catch (e) {}
                }
                // if success and URL provided and user asked to open, open default browser (macOS)
                if (code === 0 && body.url) {
                  // Notify clients to open the URL client-side (do NOT open on server)
                  for (const res of run.clients) {
                    try {
                      res.write(`data: OPEN_URL: ${String(body.url)}\n\n`);
                    } catch (e) {}
                  }
                }
                // end responses
                for (const res of run.clients) {
                  try {
                    res.end();
                  } catch (e) {}
                }
                run.finished = true;
              },
            });
          },
        });
      }
    } catch (err) {
      for (const res of run.clients) {
        try {
          res.write(`data: ERROR: ${String(err)}\n\n`);
          res.end();
        } catch (e) {}
      }
      run.finished = true;
    }
  })();

  res.json({ id });
});

app.get("/api/stream/:id", (req, res) => {
  const id = req.params.id;
  const run = runs.get(id);
  if (!run) return res.status(404).send("Not found");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders && res.flushHeaders();

  // Send existing buffer
  for (const line of run.lines) {
    try {
      res.write(`data: ${line}\n\n`);
    } catch (e) {}
  }

  run.clients.add(res);

  req.on("close", () => {
    run.clients.delete(res);
  });
});

// ── Questions CRUD ────────────────────────────────────────────────────────────

const QUESTIONS_DIR = path.join(__dirname, "questions");

app.get("/api/questions", (_req, res) => {
  if (!fs.existsSync(QUESTIONS_DIR)) return res.json([]);
  const files = fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const stat = fs.statSync(path.join(QUESTIONS_DIR, f));
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(QUESTIONS_DIR, f), "utf8")
        );
        return { name: f, size: stat.size, mtime: stat.mtime, count: Array.isArray(data) ? data.length : 0 };
      } catch {
        return { name: f, size: stat.size, mtime: stat.mtime, count: 0 };
      }
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  res.json(files);
});

app.get("/api/questions/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(QUESTIONS_DIR, filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  try {
    res.json(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    res.status(500).json({ error: "Invalid JSON" });
  }
});

app.put("/api/questions/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(QUESTIONS_DIR, filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Body must be array" });
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2), "utf8");
  res.json({ ok: true });
});

app.delete("/api/questions/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const file = path.join(QUESTIONS_DIR, filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

app.post("/api/questions/import", (req, res) => {
  const { name, questions } = req.body || {};
  if (!name || !Array.isArray(questions))
    return res.status(400).json({ error: "name and questions[] required" });
  if (!fs.existsSync(QUESTIONS_DIR)) fs.mkdirSync(QUESTIONS_DIR);
  const safe = name
    .replace(/[^a-zA-Zа-яА-ЯіІїЇєЄ0-9_\-\.]/g, "_")
    .slice(0, 60);
  const filename = `${safe}.json`;
  fs.writeFileSync(
    path.join(QUESTIONS_DIR, filename),
    JSON.stringify(questions, null, 2),
    "utf8"
  );
  res.json({ ok: true, filename });
});

// ── Confirm (send Enter to a running process stdin) ───────────────────────────

app.post("/api/confirm/:id", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "Not found" });
  for (const proc of run.procs) {
    try { proc.stdin.write("\n"); } catch (e) {}
  }
  res.json({ ok: true });
});

// ── Ollama local models ───────────────────────────────────────────────────────

app.get("/api/ollama-models", async (_req, res) => {
  const base = process.env.OLLAMA_BASE_URL
    ? process.env.OLLAMA_BASE_URL.replace(/\/v1$/, "")
    : "http://localhost:11434";
  try {
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return res.json({ available: false, models: [] });
    const data = await r.json();
    const models = (data.models || []).map((m) => m.name);
    res.json({ available: true, models });
  } catch {
    res.json({ available: false, models: [] });
  }
});

// ── Session status ────────────────────────────────────────────────────────────

app.get("/api/session-status", (_req, res) => {
  const sessionFile = path.join(__dirname, "sessions", "vseosvita.json");
  const exists = fs.existsSync(sessionFile);
  if (!exists) return res.json({ hasSession: false });
  const stat = fs.statSync(sessionFile);
  const ageDays = Math.floor((Date.now() - stat.mtimeMs) / 86400000);
  res.json({ hasSession: true, ageDays, mtime: stat.mtime });
});

const PORT = process.env.PORT_UI || 5173;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`autoTestScreen UI running at http://localhost:${PORT}`);
});
