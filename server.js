import express from "express";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (!["generate", "create", "generate_and_create"].includes(action)) {
    return res
      .status(400)
      .json({ error: "cmd must be generate, create or generate_and_create" });
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
      if (action === "generate") {
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

const PORT = process.env.PORT_UI || 5173;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`autoTestScreen UI running at http://localhost:${PORT}`);
});
