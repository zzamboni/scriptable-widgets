// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: sf:wand.and.stars;

/*
 * Blog Publishing Tracker
 * Scriptable widget for zzamboni.org
 *
 * Small: monthly goal and publishing history
 * Medium: statistics and activity heatmap
 * Large: statistics, heatmap and recent articles
 */

// ── Configuration ───────────────────────────

const SETTINGS = {
  site: "https://zzamboni.org",
  name: "ZZAMBONI.ORG",
  monthlyGoal: 4,
  refreshMinutes: 60,
  previewSize: "small",
  historyMonths: 6,
  heatmapWeeks: 12,
  timeZone: "Europe/Zurich",
  photoTag: "photos",
  linkTag: "linky"
};

const COLORS = {
  background: "#101D26",
  backgroundEnd: "#172C36",
  primary: "#FFFFFF",
  secondary: "#A2B5BF",
  article: "#32D6C5",
  link: "#D0A3FF",
  photo: "#FFBE55",
  track: "#30414B",
  empty: "#263B46"
};

const fm = FileManager.local();
const cachePath = fm.joinPath(
  fm.documentsDirectory(),
  "zzamboni-blog-activity.json"
);

const now = new Date();

// ── Date helpers ────────────────────────────

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SETTINGS.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function monthKey(date) {
  return dateKey(date).slice(0, 7);
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat("en", {
    ...options,
    timeZone: SETTINGS.timeZone
  }).format(date);
}

function localDay(date) {
  const parts = dateKey(date).split("-").map(Number);
  return new Date(Date.UTC(
    parts[0], parts[1] - 1, parts[2]
  ));
}

function daysAgo(date) {
  return Math.max(0, Math.round(
    (localDay(now) - localDay(date)) / 86400000
  ));
}

function relativeDate(date) {
  const days = daysAgo(date);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return `${days} days ago`;
}

// ── RSS feed handling ───────────────────────

async function fetchFeed(path) {
  const req = new Request(SETTINGS.site + path);
  req.timeoutInterval = 20;

  const xml = await req.loadString();

  if (req.response.statusCode !== 200) {
throw new Error(
  `RSS HTTP ${req.response.statusCode}: ${path}`
);
  }

  return parseRSS(xml);
}

async function fetchOptionalFeed(...paths) {
  for (const path of paths) {
    try {
      const posts = await fetchFeed(path);
      console.log(`${path}: ${posts.length} posts`);
      return posts;
    } catch (error) {
      console.warn(String(error));
    }
  }

  throw new Error(
    "No available feed: " + paths.join(", ")
  );
}

function parseRSS(xml) {
  const posts = [];
  const stack = [];

  let item = null;

  const parser = new XMLParser(xml);

  parser.didStartElement = function(name) {
    stack.push({ name, value: "" });

    if (name === "item") {
      item = {
        title: "",
        link: "",
        pubDate: "",
        categories: []
      };
    }
  };

  parser.foundCharacters = function(value) {
    if (stack.length) {
      stack[stack.length - 1].value += value;
    }
  };

  parser.didEndElement = function(name) {
    const element = stack.pop();

    if (!item || !element) return;

    const parent = stack.length
      ? stack[stack.length - 1].name
      : "";

    if (parent === "item") {
      const value = element.value.trim();

      if (name === "category") {
        item.categories.push(value);
      } else if (
        ["title", "link", "pubDate"].includes(name)
      ) {
        item[name] = value;
      }
    }

    if (name === "item") {
      const date = new Date(item.pubDate);

      if (
        item.link &&
        Number.isFinite(date.getTime())
      ) {
        posts.push({
          title: item.title,
          url: item.link.replace(/\/$/, ""),
          date: date.toISOString(),
          categories: item.categories
        });
      }

      item = null;
    }
  };

  parser.parse();

  return posts;
}

// ── Load and classify posts ─────────────────

async function getPosts() {
  let previous = null;

  if (fm.fileExists(cachePath)) {
    try {
      previous = JSON.parse(
        fm.readString(cachePath)
      );
    } catch (_) {}
  }

  try {
    // Taxonomy feeds identify photos and links
    // even if the main RSS feed omits categories.

    const posts = await fetchFeed("/post/index.xml");

    if (!posts.length) {
      throw new Error("Empty blog feed");
    }

const [photos, links] = await Promise.all([
  fetchOptionalFeed(
    `/tags/${encodeURIComponent(SETTINGS.photoTag)}/index.xml`
  ),
  fetchOptionalFeed(
    `/tags/${encodeURIComponent(SETTINGS.linkTag)}/index.xml`
  )
]);

    const photoURLs = new Set(
      photos.map(p => p.url)
    );

    const linkURLs = new Set(
      links.map(p => p.url)
    );

    const allPosts = new Map();

    for (const post of [...posts, ...photos, ...links]) {
const tags = (post.categories || [])
  .map(t => t.toLowerCase());

let type = "article";

if (
  photoURLs.has(post.url) ||
  tags.includes(SETTINGS.photoTag.toLowerCase())
) {
  type = "photo";
} else if (
  linkURLs.has(post.url) ||
  tags.includes(SETTINGS.linkTag.toLowerCase())
) {
  type = "link";
}

      allPosts.set(post.url, {
        ...post,
        type
      });
    }

    const data = {
      posts: [...allPosts.values()].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      ),
      fetched: now.toISOString(),
      cached: false
    };

    fm.writeString(
      cachePath,
      JSON.stringify(data)
    );

    return data;

  } catch (error) {
    console.warn(String(error));

    if (previous && previous.posts.length) {
      return {
        ...previous,
        cached: true
      };
    }

    throw error;
  }
}

// ── Publishing statistics ───────────────────

function statistics(posts) {
  const currentMonth = monthKey(now);

  const thisMonth = posts.filter(
    p => monthKey(new Date(p.date)) === currentMonth
  );

  const articles = posts.filter(
    p => p.type === "article"
  );

  const currentArticles = thisMonth.filter(
    p => p.type === "article"
  );

  const months = [];
  const today = localDay(now);

  for (
    let i = SETTINGS.historyMonths - 1;
    i >= 0;
    i--
  ) {
    const date = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - i,
      15
    ));

    const key = monthKey(date);

    months.push({
      label: formatDate(date, {
        month: "short"
      }),
      current: i === 0,
      count: articles.filter(
        p => monthKey(new Date(p.date)) === key
      ).length
    });
  }

  return {
    month: formatDate(now, { month: "long" }),
    articles: currentArticles.length,
    links: thisMonth.filter(
      p => p.type === "link"
    ).length,
    photos: thisMonth.filter(
      p => p.type === "photo"
    ).length,
    goal: SETTINGS.monthlyGoal,
    lastArticle: articles[0] || null,
    recentArticles: articles.slice(0, 3),
    months
  };
}

// ── Drawing helpers ─────────────────────────

function addText(
  parent,
  value,
  size = 12,
  color = COLORS.primary,
  weight = "regular"
) {
  const t = parent.addText(String(value));

  if (weight === "bold") {
    t.font = Font.boldSystemFont(size);
  } else if (weight === "medium") {
    t.font = Font.mediumSystemFont(size);
  } else if (weight === "semibold") {
    t.font = Font.semiboldSystemFont(size);
  } else {
    t.font = Font.systemFont(size);
  }

  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.65;

  return t;
}

function roundedRect(ctx, rect, color, radius = 2) {
  const path = new Path();

  path.addRoundedRect(rect, radius, radius);
  ctx.addPath(path);
  ctx.setFillColor(new Color(color));
  ctx.fillPath();
}

function progressBar(ratio, width) {
  const ctx = new DrawContext();

  ctx.size = new Size(width, 6);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  roundedRect(
    ctx,
    new Rect(0, 0, width, 6),
    COLORS.track,
    3
  );

  const filled = width * Math.min(1, Math.max(0, ratio));

  if (filled > 0) {
    roundedRect(
      ctx,
      new Rect(0, 0, filled, 6),
      COLORS.article,
      Math.min(3, filled / 2)
    );
  }

  return ctx.getImage();
}

// ── Monthly bar chart ───────────────────────

function monthlyChart(months, width, height) {
  const ctx = new DrawContext();

  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const labelHeight = 12;
  const chartHeight = height - labelHeight - 10;

  const slot = width / months.length;
  const barWidth = slot * 0.62;

  const max = Math.max(
    SETTINGS.monthlyGoal,
    ...months.map(m => m.count),
    1
  );

  for (let i = 0; i < months.length; i++) {
    const m = months[i];

    const x = i * slot +
      (slot - barWidth) / 2;

    const h = Math.max(
      2,
      m.count / max * chartHeight
    );

    const y = 10 + chartHeight - h;

    const color = m.current
      ? COLORS.article
      : "#39596D";

    roundedRect(
      ctx,
      new Rect(x, y, barWidth, h),
      color
    );

    // Post count above each bar
    ctx.setFont(Font.mediumSystemFont(8));
    ctx.setTextColor(new Color(COLORS.secondary));
    ctx.setTextAlignedCenter();

    ctx.drawTextInRect(
      String(m.count),
      new Rect(i * slot, y - 10, slot, 10)
    );

    // Month label
    ctx.setFont(Font.systemFont(8));

    ctx.setTextColor(new Color(
      m.current ? COLORS.article : COLORS.secondary
    ));

    ctx.drawTextInRect(
      m.label,
      new Rect(
        i * slot,
        height - labelHeight + 2,
        slot,
        labelHeight
      )
    );
  }

  return ctx.getImage();
}

// ── Publishing heatmap ──────────────────────

function heatmap(posts, width) {
  const weeks = SETTINGS.heatmapWeeks;
  const gap = 2;
  const cell = (width - (weeks - 1) * gap) / weeks;
  const height = 7 * cell + 6 * gap;

  const ctx = new DrawContext();

  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const activity = {};

  for (const post of posts) {
    const key = dateKey(new Date(post.date));

    if (!activity[key]) {
      activity[key] = new Set();
    }

    activity[key].add(post.type);
  }

  // Start each column on Monday.
  const today = localDay(now);
  const end = new Date(today);

  end.setUTCDate(
    end.getUTCDate() +
    (7 - end.getUTCDay()) % 7
  );

  const start = new Date(end);

  start.setUTCDate(
    start.getUTCDate() - weeks * 7 + 1
  );

  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const date = new Date(start);

      date.setUTCDate(
        date.getUTCDate() + col * 7 + row
      );

      const key = date.toISOString().slice(0, 10);

      const x = col * (cell + gap);
      const y = row * (cell + gap);

      // Future days are left blank.
      if (date > today) {
        continue;
      }

      const types = activity[key];

      if (!types) {
        roundedRect(
          ctx,
          new Rect(x, y, cell, cell),
          COLORS.empty
        );

        continue;
      }

      // Multiple post types on the same day
      // are shown as colored segments.
      const colors = [...types].map(
        type => COLORS[type]
      );

      if (colors.length === 1) {
        roundedRect(
          ctx,
          new Rect(x, y, cell, cell),
          colors[0]
        );
      } else {
        const segment = cell / colors.length;

        colors.forEach((color, i) => {
          ctx.setFillColor(new Color(color));
          ctx.fillRect(new Rect(
            x + i * segment,
            y,
            segment,
            cell
          ));
        });
      }
    }
  }

  return {
    image: ctx.getImage(),
    height
  };
}

// ── Widget components ───────────────────────

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
  widget.url = SETTINGS.site;

  widget.refreshAfterDate = new Date(
    Date.now() +
    SETTINGS.refreshMinutes * 60000
  );

  return widget;
}

function addHeader(widget, data, small) {
  const row = widget.addStack();
  row.centerAlignContent();

  const icon = row.addImage(
    SFSymbol.named("pencil.and.outline").image
  );

  icon.imageSize = new Size(13, 13);
  icon.tintColor = new Color(COLORS.article);

  row.addSpacer(5);

  addText(
    row,
    SETTINGS.name,
    11,
    COLORS.article,
    "bold"
  );

  row.addSpacer();

  if (data.cached) {
    addText(row, "Cached", 9, COLORS.photo);
  } else if (!small) {
    addText(
      row,
      formatDate(now, {
        month: "short",
        year: "numeric"
      }),
      10,
      COLORS.secondary
    );
  }
}

function addGoal(parent, stats, width, small) {
  const ratio = stats.goal > 0
    ? stats.articles / stats.goal
    : 0;

  const noun = stats.articles === 1
    ? "article"
    : "articles";

  addText(
    parent,
    `${stats.articles} ${noun}`,
    small ? 25 : 29,
    COLORS.primary,
    "bold"
  );

  parent.addSpacer(2);

  addText(
    parent,
    `Published in ${stats.month}`,
    10,
    COLORS.secondary
  );

  if (stats.goal > 0) {
    parent.addSpacer(5);

    const bar = parent.addImage(
      progressBar(ratio, width)
    );

    bar.imageSize = new Size(width, 6);

    parent.addSpacer(4);

    addText(
      parent,
      stats.articles >= stats.goal
        ? "Monthly goal achieved!"
        : `${stats.articles} of ${stats.goal} monthly goal`,
      10,
      COLORS.article,
      "medium"
    );
  }
}

function addLegend(parent, fontSize = 8) {
  const row = parent.addStack();
  row.centerAlignContent();

  for (const [type, label] of [
    ["article", "Articles"],
    ["link", "Links"],
    ["photo", "Photos"]
  ]) {
    const dot = row.addStack();

    dot.size = new Size(6, 6);
    dot.backgroundColor = new Color(COLORS[type]);
    dot.cornerRadius = 2;

    row.addSpacer(3);

    addText(row, label, fontSize, COLORS.secondary);
    row.addSpacer(5);
  }
}

function addHeatmap(parent, posts, width) {
  const h = heatmap(posts, width);

  const image = parent.addImage(h.image);

  image.imageSize = new Size(
    width,
    h.height
  );

  parent.addSpacer(4);

  addLegend(parent);

  parent.addSpacer(3);

  addText(
    parent,
    `Last ${SETTINGS.heatmapWeeks} weeks`,
    9,
    COLORS.secondary
  );
}

function addCounts(parent, stats) {
  const row = parent.addStack();

  for (const [type, label, count] of [
    ["article", "Articles", stats.articles],
    ["link", "Links", stats.links],
    ["photo", "Photos", stats.photos]
  ]) {
    const column = row.addStack();
    column.layoutVertically();

    addText(
      column,
      label.toUpperCase(),
      9,
      COLORS.secondary
    );

    column.addSpacer(2);

    addText(
      column,
      count,
      19,
      COLORS[type],
      "bold"
    );

    row.addSpacer();
  }
}

function addFooter(widget, stats, data) {
  if (data.cached) {
    addText(
      widget,
      "Cached: " + formatDate(
        new Date(data.fetched),
        { month: "short", day: "numeric" }
      ),
      9,
      COLORS.photo
    );
  } else {
    const last = stats.lastArticle
      ? relativeDate(new Date(stats.lastArticle.date))
      : "No articles";

    addText(
      widget,
      `Last article: ${last.toLowerCase()}`,
      10,
      COLORS.secondary
    );
  }
}

// ── Widget layouts ──────────────────────────

function smallWidget(stats, data) {
  const widget = baseWidget();

  addHeader(widget, data, true);
  widget.addSpacer();

  addGoal(widget, stats, 118, true);
  widget.addSpacer(6);

  const chart = widget.addImage(
    monthlyChart(stats.months, 120, 42)
  );

  chart.imageSize = new Size(120, 42);

  widget.addSpacer();

  addFooter(widget, stats, data);

  return widget;
}

function mediumWidget(stats, data) {
  const widget = baseWidget();

  addHeader(widget, data, false);
  widget.addSpacer();

  const row = widget.addStack();
  row.centerAlignContent();

  const left = row.addStack();
  left.layoutVertically();

  addGoal(left, stats, 120, false);

  row.addSpacer();

  const right = row.addStack();
  right.layoutVertically();

  addHeatmap(right, data.posts, 124);

  widget.addSpacer(8);

  addCounts(widget, stats);

  return widget;
}




function largeWidget(stats, data) {
  const widget = baseWidget();

  widget.setPadding(14, 14, 14, 14);
  widget.spacing = 0;

  // Header
  addHeader(widget, data, false);
  widget.addSpacer(8);

  // Monthly goal and activity heatmap
  const body = widget.addStack();
  body.centerAlignContent();

  const left = body.addStack();
  left.layoutVertically();

  addGoal(left, stats, 120, false);

  body.addSpacer();

  const right = body.addStack();
  right.layoutVertically();

  addHeatmap(right, data.posts, 116);

  widget.addSpacer(8);

  // Monthly counts
  addCounts(widget, stats);

  widget.addSpacer(8);

  // Publishing history
  const chart = widget.addImage(
    monthlyChart(stats.months, 270, 48)
  );

  chart.imageSize = new Size(270, 48);
  chart.centerAlignImage();

  widget.addSpacer(10);

  // Recent articles
  addText(
    widget,
    "RECENT ARTICLES",
    10,
    COLORS.article,
    "bold"
  );

  widget.addSpacer(5);

  for (const post of stats.recentArticles) {
    const row = widget.addStack();

    row.url = post.url;
    row.layoutVertically();
    row.spacing = 2;

    addText(
      row,
      post.title,
      12,
      COLORS.primary,
      "medium"
    );

    addText(
      row,
      relativeDate(new Date(post.date)),
      9,
      COLORS.secondary
    );

    widget.addSpacer(4);
  }

  // Absorb any remaining vertical space
  widget.addSpacer();

  // Only show footer when data is cached.
  // Otherwise the latest article date is
  // already visible in the article list.
  if (data.cached) {
    addFooter(widget, stats, data);
  }

  return widget;
}


function errorWidget(error) {
  const widget = baseWidget();

  addText(
    widget,
    SETTINGS.name,
    11,
    COLORS.article,
    "bold"
  );

  widget.addSpacer();

  addText(
    widget,
    "Unavailable",
    20,
    COLORS.primary,
    "bold"
  );

  widget.addSpacer(5);

  const text = widget.addText(
    error.message || String(error)
  );

  text.font = Font.systemFont(11);
  text.textColor = new Color(COLORS.secondary);
  text.lineLimit = 4;

  widget.addSpacer();

  return widget;
}

// ── Main ────────────────────────────────────

const size = config.runsInWidget
  ? config.widgetFamily
  : SETTINGS.previewSize;

let widget;

try {
  const data = await getPosts();
  const stats = statistics(data.posts);

  if (size === "large") {
    widget = largeWidget(stats, data);
  } else if (size === "medium") {
    widget = mediumWidget(stats, data);
  } else {
    widget = smallWidget(stats, data);
  }

} catch (error) {
  widget = errorWidget(error);
}

Script.setWidget(widget);

if (!config.runsInWidget) {
  if (size === "large") {
    await widget.presentLarge();
  } else if (size === "medium") {
    await widget.presentMedium();
  } else {
    await widget.presentSmall();
  }
}

Script.complete();
