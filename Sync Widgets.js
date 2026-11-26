// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: sync;

const SETTINGS = {
  owner: "zzamboni",
  repository: "scriptable-widgets",
  branch: "main",
  useICloud: true,
  scripts: ["Blog Publishing Tracker.js", "Netlify usage.js"]
};

const fm = SETTINGS.useICloud ? FileManager.iCloud() : FileManager.local();
const directory = fm.documentsDirectory();
const backups = fm.joinPath(directory, "Widget Backups");
const results = [];

async function resolveCommit() {
  const url = `https://api.github.com/repos/${SETTINGS.owner}/${SETTINGS.repository}/commits/${encodeURIComponent(SETTINGS.branch)}?t=${Date.now()}`;
  const request = new Request(url);
  request.timeoutInterval = 20;
  request.headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "Scriptable-Sync-Widgets",
    "Cache-Control": "no-cache, no-store, max-age=0",
    "Pragma": "no-cache"
  };
  const body = await request.loadString();
  const status = request.response.statusCode;
  if (status !== 200) {
    throw new Error(`GitHub API: HTTP ${status}`);
  }
  const sha = JSON.parse(body).sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("GitHub returned an invalid commit SHA");
  }
  return sha;
}

let commit;
try {
  commit = await resolveCommit();
} catch (error) {
  const alert = new Alert();
  alert.title = "Widget Synchronization Failed";
  alert.message = (error.message || String(error)) + "\nNo scripts changed.";
  alert.addAction("Done");
  await alert.presentAlert();
  Script.complete();
  return;
}

const baseURL = `https://raw.githubusercontent.com/${SETTINGS.owner}/${SETTINGS.repository}/${commit}/widgets/`;

for (const name of SETTINGS.scripts) {
  try {
    const path = fm.joinPath(directory, name);
    const request = new Request(baseURL + encodeURIComponent(name));
    request.timeoutInterval = 20;
    const code = await request.loadString();
    if (request.response.statusCode !== 200) {
      throw new Error(`HTTP ${request.response.statusCode}`);
    }
    if (!code.startsWith("// Variables used by Scriptable.")) {
      throw new Error("Unexpected script format");
    }
    if (fm.fileExists(path)) {
      if (SETTINGS.useICloud) await fm.downloadFileFromiCloud(path);
      const existing = fm.readString(path);
      if (existing === code) {
        results.push(`✓ ${name}: unchanged`);
        continue;
      }
      if (!fm.fileExists(backups)) fm.createDirectory(backups, true);
      fm.writeString(fm.joinPath(backups, name + ".bak"), existing);
    }
    fm.writeString(path, code);
    results.push(`✓ ${name}: updated`);
  } catch (error) {
    results.push(`✗ ${name}: ${error.message || String(error)}`);
  }
}
const alert = new Alert();
alert.title = "Widget Synchronization";
alert.message = `${SETTINGS.branch} · ${commit.slice(0, 7)}\n\n` + results.join("\n\n") + "\n\nChecked at " + new Date().toLocaleTimeString();
alert.addAction("Done");
await alert.presentAlert();
Script.complete();
