const express = require("express");
const path = require("path");
const { exec } = require("child_process");

const app = express();
const port = 3000;

const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`KMZ Analyzer rodando em ${url}`);

  if (process.platform === "win32") {
    exec(`start ${url}`);
  }
});