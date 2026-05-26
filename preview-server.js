const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 8010);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/instances" && req.method === "GET") {
    listInstances((error, instances) => {
      sendJson(res, error ? 500 : 200, error ? { error: error.message } : { instances });
    });
    return;
  }

  if (url.pathname === "/api/databases" && req.method === "POST") {
    readJson(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      listDatabases(body, (queryError, databases) => {
        sendJson(res, queryError ? 500 : 200, queryError ? { error: queryError.message } : { databases });
      });
    });
    return;
  }

  if (url.pathname === "/api/query" && req.method === "POST") {
    readJson(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      runQuery(body, (queryError, result) => {
        sendJson(res, queryError ? 500 : 200, queryError ? { error: queryError.message } : result);
      });
    });
    return;
  }

  if (url.pathname === "/api/item-groups" && req.method === "POST") {
    readJson(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      runQuery({ ...body, query: "select ItemGroup from ItemGroup order by ItemGroup" }, (queryError, result) => {
        sendJson(res, queryError ? 500 : 200, queryError ? { error: queryError.message } : {
          itemGroups: (result.rows || []).map((row) => row.ItemGroup).filter(Boolean)
        });
      });
    });
    return;
  }

  if (url.pathname === "/api/database-size" && req.method === "POST") {
    readJson(req, (error, body) => {
      if (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      getDatabaseSize(body, (queryError, result) => {
        sendJson(res, queryError ? 500 : 200, queryError ? { error: queryError.message } : result);
      });
    });
    return;
  }

  const requestPath = url.pathname === "/" ? "/dashboard-preview.html" : url.pathname;
  const filePath = path.resolve(root, `.${decodeURIComponent(requestPath)}`);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(content);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Preview available at http://127.0.0.1:${port}/dashboard-preview.html`);
});

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJson(req, callback) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      req.destroy();
    }
  });
  req.on("end", () => {
    try {
      callback(null, raw ? JSON.parse(raw) : {});
    } catch {
      callback(new Error("Invalid JSON request."));
    }
  });
}

function listInstances(callback) {
  execFile(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-Service | Where-Object { $_.Name -like 'MSSQL$*' -and $_.Status -eq 'Running' } | ForEach-Object { '.\\' + ($_.Name -replace '^MSSQL\\$','') }"
    ],
    { windowsHide: true, timeout: 10000 },
    (error, stdout, stderr) => {
      if (error) {
        callback(new Error((stderr || error.message).trim()));
        return;
      }

      callback(null, stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    }
  );
}

function listDatabases(body, callback) {
  const serverInstance = String(body.serverInstance || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!serverInstance) {
    callback(new Error("Enter a SQL Server instance name."));
    return;
  }

  const args = [
    "-S",
    serverInstance,
    "-W",
    "-h",
    "-1",
    "-Q",
    "SET NOCOUNT ON; SELECT name FROM sys.databases ORDER BY name;"
  ];

  if (username) {
    args.splice(2, 0, "-U", username, "-P", password);
  } else {
    args.splice(2, 0, "-E");
  }

  execFile("sqlcmd.exe", args, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
    if (error) {
      callback(new Error((stderr || error.message).trim()));
      return;
    }

    const databases = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("("));

    callback(null, databases);
  });
}

function getDatabaseSize(body, callback) {
  const serverInstance = String(body.serverInstance || "").trim();
  const database = String(body.database || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!serverInstance || !database) {
    callback(new Error("Select a database first."));
    return;
  }

  const query = `
select
  db_name() as DatabaseName,
  cast(sum(size) * 8.0 / 1024 as decimal(18,2)) as SizeMB
from sys.database_files;
`;

  runQuery({ serverInstance, database, username, password, query }, (error, result) => {
    if (error) {
      callback(error);
      return;
    }

    const row = (result.rows || [])[0] || {};
    const sizeMB = Number(row.SizeMB || 0);
    callback(null, {
      databaseName: row.DatabaseName || database,
      sizeMB,
      displaySize: formatSize(sizeMB)
    });
  });
}

function formatSize(sizeMB) {
  if (sizeMB >= 1024) {
    return `${(sizeMB / 1024).toFixed(2)} GB`;
  }

  return `${sizeMB.toFixed(2)} MB`;
}

function runQuery(body, callback) {
  const serverInstance = String(body.serverInstance || "").trim();
  const database = String(body.database || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const query = normalizeQuery(String(body.query || ""));

  if (!serverInstance) {
    callback(new Error("Enter a SQL Server instance name."));
    return;
  }

  if (!database) {
    callback(new Error("Select a database before running a query."));
    return;
  }

  const validationError = validateReadOnlyQuery(query);
  if (validationError) {
    callback(new Error(validationError));
    return;
  }

  const queryBase64 = Buffer.from(query, "utf16le").toString("base64");
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(root, "query-sql.ps1"),
    "-ServerInstance",
    serverInstance,
    "-Database",
    database,
    "-QueryBase64",
    queryBase64
  ];

  if (username) {
    args.splice(args.length - 2, 0, "-Username", username, "-Password", password);
  }

  const started = Date.now();
  execFile("powershell.exe", args, { windowsHide: true, timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      callback(new Error((stderr || error.message).trim()));
      return;
    }

    try {
      const result = JSON.parse(stdout.trim() || "{\"columns\":[],\"rows\":[]}");

      callback(null, {
        columns: result.columns || [],
        rows: result.rows || [],
        runtimeMs: Date.now() - started
      });
    } catch {
      callback(new Error("SQL Server returned data, but the dashboard could not parse it."));
    }
  });
}

function normalizeQuery(query) {
  return query.trim().replace(/;+$/g, "");
}

function validateReadOnlyQuery(query) {
  if (!query) {
    return "Enter a SELECT query first.";
  }

  if (!/^(select)\b/i.test(query)) {
    return "Only SELECT queries are supported in this dashboard preview.";
  }

  if (/(^|[\s;])(insert|update|delete|drop|alter|create|truncate|exec|execute|merge|grant|revoke)\b/i.test(query)) {
    return "Only read-only SELECT queries are allowed.";
  }

  return "";
}
