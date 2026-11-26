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
const baseURL = `https://raw.githubusercontent.com/${SETTINGS.owner}/${SETTINGS.repository}/${SETTINGS.branch}/widgets/`;
const results = [];

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
alert.message = results.join("\n\n");
alert.addAction("Done");
await alert.presentAlert();
Script.complete();
