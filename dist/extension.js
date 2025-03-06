"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate,
  parseGoBenchmarkOutput: () => parseGoBenchmarkOutput
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var import_fs = require("fs");
function parseGoBenchmarkOutput(content) {
  const lines = content.split("\n");
  const metadata = {
    goos: "",
    goarch: "",
    pkg: "",
    cpu: ""
  };
  const benchmarkMap = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("goos:")) {
      metadata.goos = line.replace("goos:", "").trim();
      continue;
    }
    if (line.startsWith("goarch:")) {
      metadata.goarch = line.replace("goarch:", "").trim();
      continue;
    }
    if (line.startsWith("pkg:")) {
      metadata.pkg = line.replace("pkg:", "").trim();
      continue;
    }
    if (line.startsWith("cpu:")) {
      metadata.cpu = line.replace("cpu:", "").trim();
      continue;
    }
    if (line.startsWith("PASS") || line.startsWith("FAIL") || line.startsWith("ok")) {
      continue;
    }
    if (line.startsWith("Benchmark")) {
      const parts = line.trim().split(/\s+/);
      const fullName = parts[0];
      const iterations = parseInt(parts[1].replace(/,/g, ""), 10);
      const nameMatch = fullName.match(/^(Benchmark[^/]+)\/(.*)-(.*)$/);
      const baseName = nameMatch ? nameMatch[1] : fullName;
      if (!benchmarkMap.has(baseName)) {
        benchmarkMap.set(baseName, {
          name: baseName,
          runs: []
        });
      }
      const run = {
        iterations,
        metrics: [],
        params: /* @__PURE__ */ new Map()
      };
      for (let i = 2; i < parts.length; i += 2) {
        run.metrics?.push({
          name: parts[i + 1],
          value: parseFloat(parts[i])
        });
      }
      run.params.set("name", nameMatch?.[2]);
      run.params.set("cpus", nameMatch?.[3]);
      benchmarkMap.get(baseName)?.runs.push(run);
    }
  }
  const results = Array.from(benchmarkMap.values());
  return { metadata, results };
}
function activate(context) {
  console.log('Congratulations, your extension "benchvis-vscode" is now active!');
  const disposable = vscode.commands.registerCommand("benchvis-vscode.visualize-file", async () => {
    vscode.window.showInformationMessage("Starting benchmark visualization...");
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("No active file. Please open a benchmark file first.");
      return;
    }
    const document = activeEditor.document;
    const filePath = document.uri.fsPath;
    console.log(`Active file path: ${filePath}`);
    try {
      const content = await import_fs.promises.readFile(filePath, "utf8");
      const benchmarkData = parseGoBenchmarkOutput(content);
      console.log("Parsed benchmark data:", JSON.stringify(benchmarkData, (key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        }
        return value;
      }, 2));
      vscode.window.showInformationMessage(`Successfully parsed benchmark data with ${benchmarkData.results.length} benchmark(s)`);
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage(`Failed to parse benchmark file: ${error}`);
    }
  });
  context.subscriptions.push(disposable);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate,
  parseGoBenchmarkOutput
});
//# sourceMappingURL=extension.js.map
