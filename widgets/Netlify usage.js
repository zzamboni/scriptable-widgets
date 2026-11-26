// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: sf:globe.europe.africa.fill;

/*
 * Netlify Build Minutes
 * iOS Scriptable widget
 *
 * Supports small and medium widgets.
 * Run in Scriptable for initial setup.
 */

// ── Configuration ───────────────────────────

const SETTINGS = {
  refreshMinutes: 60,
  previewSize: "small",
  warningThreshold: 75,
  criticalThreshold: 90,
  keychainToken: "netlify-widget-token",
  keychainAccount: "netlify-widget-account",
  keychainCache: "netlify-widget-cache"
};

const COLORS = {
  background: "#101D26",
  backgroundEnd: "#172C36",
  accent: "#32D6C5",
  primary: "#FFFFFF",
  secondary: "#A2B5BF",
  track: "#30414B",
  warning: "#FFBE55",
  critical: "#FF6464"
};

// ── Configuration and credentials ────────────


async function setup() {
  const account = "zzamboni";

  const alert = new Alert();
  alert.title = "Netlify API Token";
  alert.message =
    "Copy your Netlify personal access token " +
    "to the clipboard before continuing.";

  alert.addAction("Import from clipboard");
  alert.addCancelAction("Cancel");

  if (await alert.presentAlert() === -1) {
    throw new Error("Setup cancelled");
  }

  const token = (Pasteboard.pasteString() || "").trim();

  if (!token) {
    throw new Error("Clipboard is empty");
  }

  if (/\s/.test(token)) {
    throw new Error("Invalid token format");
  }

  Keychain.set(SETTINGS.keychainAccount, account);
  Keychain.set(SETTINGS.keychainToken, token);

  if (Keychain.contains(SETTINGS.keychainCache)) {
    Keychain.remove(SETTINGS.keychainCache);
  }

  // Remove the token from the clipboard
  Pasteboard.copyString("");
}


// ── Netlify API ──────────────────────────────

async function fetchUsage() {
  const account = Keychain.get(
    SETTINGS.keychainAccount
  );

  const token = Keychain.get(
    SETTINGS.keychainToken
  );

  const endpoint =
    "https://api.netlify.com/api/v1/" +
    encodeURIComponent(account) +
    "/builds/status";

  const request = new Request(endpoint);
  request.headers = {
    "Authorization": "Bearer " + token,
    "Accept": "application/json"
  };
  request.timeoutInterval = 15;

  const response = await request.loadJSON();
  const status = request.response.statusCode;

  if (status !== 200) {
    throw new Error("Netlify API: HTTP " + status);
  }

  // Handle either an object or an array response.
  const data = Array.isArray(response)
    ? response[0]
    : response;

  if (!data || !data.minutes) {
    throw new Error("Build minute data unavailable");
  }

  const m = data.minutes;

  if (
    m.current == null ||
    m.included_minutes == null
  ) {
    throw new Error("Build minute allowance unavailable");
  }

  const used = Number(m.current);
  const included = Number(m.included_minutes);

  const withPacks = Number(
    m.included_minutes_with_packs
  );

  const limit = Math.max(
    included,
    Number.isFinite(withPacks) ? withPacks : 0
  );

  if (
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    used < 0 ||
    limit <= 0
  ) {
    throw new Error("Invalid build minute allowance");
  }

  return {
    used: used,
    limit: limit,
    remaining: Math.max(0, limit - used),
    percentage: used / limit * 100,
    previous: m.previous ?? null,
    periodStart: m.period_start_date,
    periodEnd: m.period_end_date,
    updated: m.last_updated_at || new Date().toISOString(),
    fetched: new Date().toISOString(),
    builds: data.build_count ?? null,
    active: data.active ?? 0,
    queued: data.enqueued ?? 0,
    cached: false
  };
}

async function getUsage() {
  try {
    const data = await fetchUsage();

    Keychain.set(
      SETTINGS.keychainCache,
      JSON.stringify(data)
    );

    return data;
  } catch (error) {
    console.warn(String(error));

    if (Keychain.contains(SETTINGS.keychainCache)) {
      const data = JSON.parse(
        Keychain.get(SETTINGS.keychainCache)
      );

      data.cached = true;
      return data;
    }

    throw error;
  }
}

// ── Formatting helpers ───────────────────────

function formatNumber(n) {
  if (n == null || !Number.isFinite(Number(n))) {
    return "–";
  }

  return Number(n).toLocaleString(
    undefined,
    { maximumFractionDigits: 1 }
  );
}

function formatDate(value, pattern) {
  const date = new Date(value);

  if (!value || isNaN(date.getTime())) {
    return "–";
  }

  const formatter = new DateFormatter();
  formatter.dateFormat = pattern;
  return formatter.string(date);
}

function daysUntil(value) {
  const date = new Date(value);

  if (!value || isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (date.getTime() - Date.now()) / 86400000
    )
  );
}

function usageColor(percentage) {
  if (percentage >= SETTINGS.criticalThreshold) {
    return COLORS.critical;
  }

  if (percentage >= SETTINGS.warningThreshold) {
    return COLORS.warning;
  }

  return COLORS.accent;
}

function addText(
  parent,
  value,
  size,
  color,
  weight = "regular"
) {
  const text = parent.addText(String(value));

  const fonts = {
    regular: Font.systemFont,
    medium: Font.mediumSystemFont,
    semibold: Font.semiboldSystemFont,
    bold: Font.boldSystemFont
  };

  text.font = fonts[weight](size);
  text.textColor = new Color(color);
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.65;

  return text;
}

// ── Progress bar ─────────────────────────────

function progressBar(percentage, color, width) {
  const height = 8;
  const ctx = new DrawContext();

  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  function roundedRect(rect, radius, fill) {
    const path = new Path();
    path.addRoundedRect(rect, radius, radius);
    ctx.addPath(path);
    ctx.setFillColor(new Color(fill));
    ctx.fillPath();
  }

  roundedRect(
    new Rect(0, 0, width, height),
    4,
    COLORS.track
  );

  const ratio = Math.min(
    1, Math.max(0, percentage / 100)
  );

  const filled = width * ratio;

  if (filled > 0) {
    roundedRect(
      new Rect(0, 0, filled, height),
      Math.min(4, filled / 2),
      color
    );
  }

  return ctx.getImage();
}

// ── Widget appearance ────────────────────────

function baseWidget() {
  const widget = new ListWidget();

  const gradient = new LinearGradient();
  gradient.colors = [
    new Color(COLORS.background),
    new Color(COLORS.backgroundEnd)
  ];
  gradient.locations = [0, 1];

  widget.backgroundGradient = gradient;
  widget.setPadding(14, 14, 14, 14);

  widget.refreshAfterDate = new Date(
    Date.now() + SETTINGS.refreshMinutes * 60000
  );

  if (Keychain.contains(SETTINGS.keychainAccount)) {
    const account = Keychain.get(
      SETTINGS.keychainAccount
    );

    widget.url =
      "https://app.netlify.com/teams/" +
      encodeURIComponent(account) +
      "/builds";
  }

  return widget;
}

function addHeader(widget, data, medium) {
  const header = widget.addStack();
  header.centerAlignContent();

  const symbol = SFSymbol.named("globe");
  const icon = header.addImage(symbol.image);
  icon.imageSize = new Size(14, 14);
  icon.tintColor = new Color(COLORS.accent);

  header.addSpacer(5);

  addText(
    header, "NETLIFY", 11,
    COLORS.accent, "bold"
  );

  header.addSpacer();

  if (data.cached) {
    const warning = header.addImage(
      SFSymbol.named(
        "exclamationmark.arrow.triangle.2.circlepath"
      ).image
    );

    warning.imageSize = new Size(12, 12);
    warning.tintColor = new Color(COLORS.warning);
  } else if (medium) {
    addText(
      header,
      "Updated " + formatDate(data.updated, "HH:mm"),
      10,
      COLORS.secondary
    );
  }
}

function addUsage(parent, data, medium) {
  const color = usageColor(data.percentage);

  addText(
    parent,
    formatNumber(data.used) +
      " / " + formatNumber(data.limit),
    medium ? 28 : 24,
    COLORS.primary,
    "bold"
  );

  parent.addSpacer(2);

  addText(
    parent,
    "Build minutes used",
    11,
    COLORS.secondary
  );

  parent.addSpacer(8);

  const width = medium ? 170 : 120;

  const bar = parent.addImage(
    progressBar(data.percentage, color, width)
  );

  bar.imageSize = new Size(width, 8);

  parent.addSpacer(5);

  const row = parent.addStack();
  row.centerAlignContent();

  addText(
    row,
    Math.round(data.percentage) + "%",
    12,
    color,
    "semibold"
  );

  row.addSpacer();

  addText(
    row,
    formatNumber(data.remaining) + " left",
    11,
    COLORS.secondary
  );
}

function createWidget(data, medium) {
  const widget = baseWidget();

  addHeader(widget, data, medium);
  widget.addSpacer();

  if (medium) {
    const body = widget.addStack();

    const usage = body.addStack();
    usage.layoutVertically();

    addUsage(usage, data, true);

    body.addSpacer(18);

    const stats = body.addStack();
    stats.layoutVertically();

    addText(
      stats, "Builds this period",
      10, COLORS.secondary
    );

    addText(
      stats, formatNumber(data.builds),
      22, COLORS.primary, "bold"
    );

    stats.addSpacer(5);

    addText(
      stats, "Previous period",
      10, COLORS.secondary
    );

    addText(
      stats,
      formatNumber(data.previous) + " min",
      14, COLORS.primary, "medium"
    );

    if (data.active > 0 || data.queued > 0) {
      stats.addSpacer(4);

      addText(
        stats,
        data.active + " active · " +
          data.queued + " queued",
        10, COLORS.accent
      );
    }
  } else {
    addUsage(widget, data, false);
  }

  widget.addSpacer();

  const days = daysUntil(data.periodEnd);
  const resetDate = formatDate(
    data.periodEnd, "MMM d"
  );

  const expired = data.cached &&
    data.periodEnd &&
    new Date(data.periodEnd).getTime() <= Date.now();

  let footer = expired
    ? "Cached: previous billing period"
    : "Resets " + resetDate;

  if (!expired && days !== null) {
    footer += " · " + days + "d";
  }

  addText(
    widget, footer, 10, COLORS.secondary
  );

  if (data.cached) {
    widget.addSpacer(2);

    addText(
      widget,
      "Cached · " +
        formatDate(data.fetched, "MMM d HH:mm"),
      9,
      COLORS.warning
    );
  }

  return widget;
}

function errorWidget(message) {
  const widget = baseWidget();

  addText(
    widget, "NETLIFY", 12,
    COLORS.accent, "bold"
  );

  widget.addSpacer();

  addText(
    widget, "Unavailable", 20,
    COLORS.primary, "bold"
  );

  widget.addSpacer(5);

  const detail = widget.addText(message);
  detail.font = Font.systemFont(11);
  detail.textColor = new Color(COLORS.secondary);
  detail.lineLimit = 4;

  widget.addSpacer();

  return widget;
}

// ── Main ─────────────────────────────────────

let widget;
let medium = config.runsInWidget
  ? config.widgetFamily === "medium"
  : SETTINGS.previewSize === "medium";

try {
  const configured =
    Keychain.contains(SETTINGS.keychainToken) &&
    Keychain.contains(SETTINGS.keychainAccount);

  if (!configured) {
    if (config.runsInWidget) {
      throw new Error(
        "Open this script in Scriptable to configure."
      );
    }

    await setup();
  } else if (!config.runsInWidget) {
    const menu = new Alert();
    menu.title = "Netlify Build Minutes";
    menu.addAction("Preview small widget");
    menu.addAction("Preview medium widget");
    menu.addAction("Change credentials");
    menu.addCancelAction("Cancel");

    const choice = await menu.presentSheet();

    if (choice === -1) {
      Script.complete();
      return;
    }

    if (choice === 0) medium = false;
    if (choice === 1) medium = true;
    if (choice === 2) await setup();
  }

  const data = await getUsage();
  widget = createWidget(data, medium);

} catch (error) {
  widget = errorWidget(error.message || String(error));
}

Script.setWidget(widget);

if (!config.runsInWidget) {
  if (medium) {
    await widget.presentMedium();
  } else {
    await widget.presentSmall();
  }
}

Script.complete();
