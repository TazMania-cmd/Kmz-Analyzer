const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// Quando virar .exe, ele usa a pasta onde o .exe está.
// Quando rodar com node, ele usa a pasta do projeto.
const basePath = process.pkg ? path.dirname(process.execPath) : __dirname;
const distPath = path.join(basePath, "dist");
const indexPath = path.join(distPath, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("Erro: pasta dist ou index.html não encontrado.");
  console.error("Caminho procurado:", indexPath);
  console.log("");
  console.log("Deixe a pasta dist no mesmo local do kmz-analyzer.exe.");
  console.log("Pressione Ctrl + C para sair.");
  process.stdin.resume();
} else {
  app.use(express.static(distPath));

  app.use((req, res) => {
    res.sendFile(indexPath);
  });

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`KMZ Analyzer rodando em ${url}`);

    // Abre o navegador automaticamente no Windows
    exec(`start ${url}`);
  });
}