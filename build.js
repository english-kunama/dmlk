const fs = require('fs');
const path = require('path');

/**
 * Parse a markdown file and return an object with front matter (metadata) and body.
 * Front matter is expected to be YAML-like between '---' separators.
 * @param {string} content Markdown file content
 */
function parseFrontMatter(content) {
  const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)/;
  const match = content.match(fmRegex);
  if (match) {
    const yaml = match[1];
    const body = match[2];
    const metadata = {};
    yaml.split(/\n/).forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > -1) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        metadata[key] = value;
      }
    });
    return { metadata, body };
  }
  return { metadata: {}, body: content };
}

/**
 * Convert a very limited subset of Markdown syntax into HTML. This is not a
 * full-featured parser but sufficient for our simple content needs. Supports
 * headings (#, ##, ###), paragraphs, bold (**bold**), italic (*italic*),
 * unordered lists, and links.
 * @param {string} md Markdown text
 */
function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const htmlLines = [];
  let inList = false;
  lines.forEach((line) => {
    // Heading
    if (/^###\s+/.test(line)) {
      htmlLines.push(`<h3>${line.replace(/^###\s+/, '')}</h3>`);
    } else if (/^##\s+/.test(line)) {
      htmlLines.push(`<h2>${line.replace(/^##\s+/, '')}</h2>`);
    } else if (/^#\s+/.test(line)) {
      htmlLines.push(`<h1>${line.replace(/^#\s+/, '')}</h1>`);
    }
    // Unordered list
    else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        inList = true;
        htmlLines.push('<ul>');
      }
      const item = line.replace(/^[-*]\s+/, '');
      htmlLines.push(`<li>${inlineMd(item)}</li>`);
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      if (line.trim() === '') {
        // Blank line separates paragraphs
        htmlLines.push('');
      } else {
        htmlLines.push(`<p>${inlineMd(line)}</p>`);
      }
    }
  });
  if (inList) {
    htmlLines.push('</ul>');
  }
  // Join consecutive empty strings into a single newline
  return htmlLines.filter(Boolean).join('\n');
}

/**
 * Convert inline markdown syntax within a line to HTML: bold, italic, and links.
 * @param {string} text Text with inline markdown
 */
function inlineMd(text) {
  // Bold **text**
  let result = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

/**
 * Load an HTML template and replace placeholders with values.
 * Placeholders use the syntax {{ key }}.
 * @param {string} templatePath Path to template file
 * @param {object} vars Variables to substitute
 */
function renderTemplate(templatePath, vars) {
  let template = fs.readFileSync(templatePath, 'utf-8');
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, p1) => {
    return vars[p1] !== undefined ? vars[p1] : match;
  });
}

/**
 * Generate the site by converting markdown files to HTML and assembling pages.
 */
function buildSite() {
  const contentDir = path.join(__dirname, 'content');
  const postsDir = path.join(contentDir, 'posts');
  const announcementsDir = path.join(contentDir, 'announcements');
  const publicDir = path.join(__dirname, 'public');
  const postsOutDir = path.join(publicDir, 'posts');
  const annOutDir = path.join(publicDir, 'announcements');

  // Ensure output directories exist
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(postsOutDir, { recursive: true });
  fs.mkdirSync(annOutDir, { recursive: true });

  const posts = [];
  const announcements = [];

  // Helper to process markdown files from a folder
  function processMarkdownFiles(folder, outDir, collection) {
    const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    files.forEach((file) => {
      if (!file.endsWith('.md')) return;
      const filePath = path.join(folder, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { metadata, body } = parseFrontMatter(raw);
      const htmlContent = mdToHtml(body);
      const slug = metadata.slug || file.replace(/\.md$/, '');
      const outputFile = path.join(outDir, `${slug}.html`);
      // Render using post template
      const rendered = renderTemplate(path.join(__dirname, 'templates', 'post.html'), {
        title: metadata.title || slug,
        date: metadata.date || '',
        content: htmlContent,
      });
      fs.writeFileSync(outputFile, rendered);
      collection.push({
        title: metadata.title || slug,
        date: metadata.date || '',
        slug: slug,
        summary: metadata.summary || body.split(/\n/)[0].substring(0, 120) + '...',
      });
    });
  }

  // Process posts and announcements
  processMarkdownFiles(postsDir, postsOutDir, posts);
  processMarkdownFiles(announcementsDir, annOutDir, announcements);

  // Sort by date descending (if date provided)
  const parseDate = (str) => new Date(str);
  posts.sort((a, b) => {
    if (a.date && b.date) return parseDate(b.date) - parseDate(a.date);
    return 0;
  });
  announcements.sort((a, b) => {
    if (a.date && b.date) return parseDate(b.date) - parseDate(a.date);
    return 0;
  });

  // Generate news listing page
  const newsCards = posts
    .map(
      (post) =>
        `<div class="card">
          <h3><a href="/posts/${post.slug}.html">${post.title}</a></h3>
          <p class="meta">${post.date}</p>
          <p>${post.summary}</p>
        </div>`
    )
    .join('\n');
  // Include a client-side search bar for filtering news cards
  const newsSearch = `
    <div class="search-wrapper">
      <input type="text" id="search" class="search-input" placeholder="Search news..." aria-label="Search news" />
    </div>
  `;
  const newsHtml = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
    title: 'DMLEK News',
    content: `<h2>Latest News</h2>\n${newsSearch}\n${newsCards}`,
  });
  fs.writeFileSync(path.join(publicDir, 'news.html'), newsHtml);

  // Generate announcements listing page
  const annCards = announcements
    .map(
      (ann) =>
        `<div class="card">
          <h3><a href="/announcements/${ann.slug}.html">${ann.title}</a></h3>
          <p class="meta">${ann.date}</p>
          <p>${ann.summary}</p>
        </div>`
    )
    .join('\n');
  // Add search input for announcements page as well
  const annSearch = `
    <div class="search-wrapper">
      <input type="text" id="search" class="search-input" placeholder="Search announcements..." aria-label="Search announcements" />
    </div>
  `;
  const announcementsHtml = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
    title: 'DMLEK Announcements',
    content: `<h2>Announcements</h2>\n${annSearch}\n${annCards}`,
  });
  fs.writeFileSync(path.join(publicDir, 'announcements.html'), announcementsHtml);

  // Generate home page: include introduction and latest 3 posts
  const latestPosts = posts.slice(0, 3)
    .map(
      (post) =>
        `<div class="card">
          <h3><a href="/posts/${post.slug}.html">${post.title}</a></h3>
          <p class="meta">${post.date}</p>
          <p>${post.summary}</p>
        </div>`
    )
    .join('\n');
  // Use the official Kunama flag as the hero banner. This image was provided by the user.
  const hero = `<div class="hero"><img src="images/kunama-flag.png" alt="Kunama flag"></div>`;
  const homeIntro = `
    ${hero}
    <p>The Democratic Movement for the Liberation of the Eritrean Kunama (DMLEK) is a political and armed organisation advocating for the rights and autonomy of the Kunama people. Founded on 1 April 1995 in response to long‑standing marginalisation under the Eritrean government, the group campaigns for self‑determination and greater representation for the Kunama ethnic group. DMLEK is primarily funded by the Eritrean diaspora and is allied with the Red Sea Afar Democratic Organisation (RSADO).</p>
    <p>Through this site we share news, articles and announcements about our struggle for freedom and justice. Stay informed about the latest developments and learn more about the Kunama people and our quest for self‑determination.</p>
    <h2>Latest Updates</h2>
    ${latestPosts}
  `;
  const indexHtml = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
    title: 'Home',
    content: homeIntro,
  });
  fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);

  // Generate about page. If a markdown file exists in content/about.md
  // we convert it; otherwise we use a default description.
  let aboutContent;
  const aboutMdPath = path.join(contentDir, 'about.md');
  if (fs.existsSync(aboutMdPath)) {
    const aboutRaw = fs.readFileSync(aboutMdPath, 'utf-8');
    const { metadata: aboutMeta, body: aboutBody } = parseFrontMatter(aboutRaw);
    aboutContent = mdToHtml(aboutBody);
  } else {
    aboutContent = `
    <h2>About DMLEK</h2>
    <p>The Democratic Movement for the Liberation of the Eritrean Kunama (DMLEK) was created on 1 April 1995 after Eritrea gained independence from Ethiopia. It emerged because the Kunama people – one of Eritrea’s nine recognised ethnic groups – faced discrimination and marginalisation under successive governments. DMLEK seeks to secure greater autonomy, independence and representation for Kunama communities. While some members advocate separatism, the movement’s core objective is to achieve recognition and self‑determination for the Kunama through political engagement and, when necessary, armed struggle.</p>
    <p>DMLEK is part of the Eritrean Democratic Alliance and maintains alliances with other groups such as the Red Sea Afar Democratic Organisation. It draws much of its support from the Eritrean diaspora.</p>
    <p>We believe in upholding the rights of minorities, preserving the distinct Kunama language and culture, and ensuring that all Eritrean communities enjoy equality and respect under the law.</p>
    `;
  }
  // Append the emblem image to the about content for visual branding
  const emblemHtml = `<div class="about-emblem"><img src="images/emblem.jpg" alt="DMLEK emblem" /></div>`;
  const aboutHtml = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
    title: 'About',
    content: aboutContent + emblemHtml,
  });
  fs.writeFileSync(path.join(publicDir, 'about.html'), aboutHtml);

  // Generate contact page if present
  const contactMdPath = path.join(contentDir, 'contact.md');
  if (fs.existsSync(contactMdPath)) {
    const raw = fs.readFileSync(contactMdPath, 'utf-8');
    const { metadata: contactMeta, body: contactBody } = parseFrontMatter(raw);
    const contactHtmlContent = mdToHtml(contactBody);
    const contactRendered = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
      title: contactMeta.title || 'Contact',
      content: contactHtmlContent,
    });
    fs.writeFileSync(path.join(publicDir, 'contact.html'), contactRendered);
  }

  // Generate gallery page if present
  const galleryMdPath = path.join(contentDir, 'gallery.md');
  if (fs.existsSync(galleryMdPath)) {
    const raw = fs.readFileSync(galleryMdPath, 'utf-8');
    const { metadata: galleryMeta, body: galleryBody } = parseFrontMatter(raw);
    const galleryHtmlContent = mdToHtml(galleryBody);
    const galleryRendered = renderTemplate(path.join(__dirname, 'templates', 'layout.html'), {
      title: galleryMeta.title || 'Gallery',
      content: galleryHtmlContent,
    });
    fs.writeFileSync(path.join(publicDir, 'gallery.html'), galleryRendered);
  }

  // After generating all pages, copy the Netlify CMS admin interface into the
  // published output.  The admin files live in the top-level `admin` directory,
  // but Netlify publishes only the contents of the `public` folder.  To make
  // `/admin` available on the deployed site, recursively copy `admin` into
  // `public/admin`.  Use `fs.cpSync` on Node versions that support it; fall
  // back to a manual recursive copy otherwise.
  const adminSrc = path.join(__dirname, 'admin');
  const adminDest = path.join(publicDir, 'admin');
  if (fs.existsSync(adminSrc)) {
    // Ensure destination exists
    fs.mkdirSync(adminDest, { recursive: true });
    if (typeof fs.cpSync === 'function') {
      fs.cpSync(adminSrc, adminDest, { recursive: true });
    } else {
      function copyDir(src, dest) {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
      copyDir(adminSrc, adminDest);
    }
  }
}

buildSite();