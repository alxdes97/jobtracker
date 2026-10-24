/**
 * Reads a job posting out of a page.
 *
 * This function must stay self-contained: the popup injects it into the open
 * tab with chrome.scripting.executeScript, which serialises the function body
 * and drops anything it would close over. Pass `html` to read a page that was
 * fetched instead of the live document.
 */
// eslint-disable-next-line no-unused-vars
function readJobPosting(pageUrl, html) {
  const doc = html ? new DOMParser().parseFromString(html, 'text/html') : document;
  const live = !html;
  const url = String(pageUrl || (live ? location.href : ''));
  let host = '';
  let path = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    path = parsed.pathname;
  } catch {
    // Leave host empty for unusual URLs.
  }

  const squash = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  const htmlToText = (value) => {
    let text = String(value ?? '');
    for (let pass = 0; pass < 2; pass += 1) {
      text = text
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ');
      text = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html').body.textContent || '';
      if (!/<[a-z][\s\S]*>/i.test(text)) break;
    }
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const blockText = (node) => {
    if (!node) return '';
    if (live && typeof node.innerText === 'string') {
      return node.innerText.replace(/\n{3,}/g, '\n\n').trim();
    }
    return htmlToText(node.innerHTML);
  };

  const first = (selectors, read = (node) => squash(node.textContent)) => {
    for (const selector of selectors) {
      let nodes;
      try {
        nodes = doc.querySelectorAll(selector);
      } catch {
        continue;
      }
      for (const node of nodes) {
        const value = read(node);
        if (value) return value;
      }
    }
    return '';
  };

  const meta = (...names) => {
    for (const name of names) {
      const node = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      const value = squash(node?.getAttribute('content'));
      if (value) return value;
    }
    return '';
  };

  const titleCase = (slug) =>
    squash(String(slug).replace(/[-_+]+/g, ' '))
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(' ');

  // ---- Structured data (schema.org JobPosting) ----------------------------
  const postings = [];
  const walk = (data) => {
    if (!data || postings.length > 5) return;
    if (Array.isArray(data)) {
      data.forEach(walk);
      return;
    }
    if (typeof data !== 'object') return;
    const types = [].concat(data['@type'] || []);
    if (types.includes('JobPosting')) postings.push(data);
    if (data['@graph']) walk(data['@graph']);
    if (data.mainEntity) walk(data.mainEntity);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      walk(JSON.parse(node.textContent || ''));
    } catch {
      // Ignore broken markup on the page.
    }
  });
  const posting = postings[0] || null;

  const locationFromPosting = (data) => {
    if (!data) return '';
    const places = [].concat(data.jobLocation || []).map((place) => {
      const address = place?.address ?? place;
      if (!address) return '';
      if (typeof address === 'string') return squash(address);
      const country = typeof address.addressCountry === 'object' ? address.addressCountry?.name : address.addressCountry;
      return [address.addressLocality, address.addressRegion, country]
        .map(squash)
        .filter(Boolean)
        .filter((part, index, list) => list.indexOf(part) === index)
        .join(', ');
    });
    const remote = [].concat(data.jobLocationType || []).some((type) => /telecommute|remote/i.test(String(type)));
    const unique = [...new Set(places.filter(Boolean))];
    if (remote) unique.unshift('Remote');
    return unique.slice(0, 3).join(' · ');
  };

  const UNIT_FACTORS = { HOUR: 2080, DAY: 260, WEEK: 52, MONTH: 12, YEAR: 1 };
  const unitOf = (value) => {
    const text = String(value || '').toLowerCase();
    if (/hour|hr/.test(text)) return 'HOUR';
    if (/day|daily/.test(text)) return 'DAY';
    if (/week/.test(text)) return 'WEEK';
    if (/month|mo\b/.test(text)) return 'MONTH';
    return 'YEAR';
  };

  const salaryFromPosting = (data) => {
    const salary = data?.baseSalary || data?.estimatedSalary;
    const entry = Array.isArray(salary) ? salary[0] : salary;
    if (!entry) return null;
    const value = entry.value ?? entry;
    const toNumber = (raw) => {
      const num = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
      return Number.isFinite(num) && num > 0 ? num : null;
    };
    let min = toNumber(typeof value === 'object' ? value.minValue ?? value.value : value);
    let max = toNumber(typeof value === 'object' ? value.maxValue ?? value.value : value);
    if (!min && !max) return null;
    const factor = UNIT_FACTORS[unitOf(value?.unitText || entry.unitText)] || 1;
    if (min) min = Math.round(min * factor);
    if (max) max = Math.round(max * factor);
    return { min, max, currency: squash(entry.currency || value?.currency).toUpperCase() };
  };

  // ---- Salary written in the page text ------------------------------------
  const SYMBOLS = { $: 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', '¥': 'JPY' };
  const salaryFromText = (text) => {
    if (!text) return null;
    const amount = String.raw`(\d{1,3}(?:[,.]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d+)?)\s*([kKmM])?`;
    const unit = String.raw`(?:\s*(?:\/|per|an?|each)\s*(hour|hr|day|week|month|year|yr|annum))?`;
    const symbol = String.raw`(?:US\$|CA\$|C\$|A\$|[$€£₹¥]|(?:USD|EUR|GBP|CAD|AUD|INR)\s?)`;
    const pattern = new RegExp(
      String.raw`(US\$|CA\$|C\$|A\$|[$€£₹¥]|\b(?:USD|EUR|GBP|CAD|AUD|INR)\s?)\s?${amount}${unit}` +
        String.raw`(?:\s*(?:-|–|—|to|and)\s*${symbol}?\s?${amount}${unit})?`,
      'i',
    );
    const scale = (raw, suffix) => {
      if (!raw) return null;
      const num = Number(String(raw).replace(/[,](?=\d{3})/g, '').replace(/\.(?=\d{3}(\D|$))/g, ''));
      if (!Number.isFinite(num)) return null;
      if (/k/i.test(suffix || '')) return num * 1000;
      if (/m/i.test(suffix || '')) return num * 1000000;
      return num;
    };
    // Pay ranges are often split over lines, e.g. "$164,000/yr\n-\n$205,000/yr".
    const joined = String(text)
      .replace(/[ \t]*\n[ \t]*(?=[-–—]|to\s)/g, ' ')
      .replace(/([-–—]|\bto)[ \t]*\n[ \t]*/g, '$1 ');
    const lines = joined.split(/\n+/);
    for (const line of lines) {
      const match = pattern.exec(line);
      if (!match) continue;
      const [, symbol, lowRaw, lowSuffix, lowUnit, highRaw, highSuffix, highUnit] = match;
      const unitRaw = lowUnit || highUnit;
      const unit = unitOf(unitRaw || (/hour|hourly|\/hr/i.test(line) ? 'hour' : ''));
      let min = scale(lowRaw, lowSuffix || highSuffix);
      let max = scale(highRaw, highSuffix);
      const smallest = unit === 'YEAR' ? 1000 : 5;
      if (!min || min < smallest) continue;
      const factor = UNIT_FACTORS[unit] || 1;
      min = Math.round(min * factor);
      max = max ? Math.round(max * factor) : null;
      const cleaned = symbol.trim().toUpperCase();
      const currency =
        SYMBOLS[cleaned] ||
        (cleaned === 'CA$' || cleaned === 'C$' ? 'CAD' : cleaned === 'A$' ? 'AUD' : cleaned === 'US$' ? 'USD' : cleaned);
      return { min, max: max && max >= min ? max : null, currency };
    }
    return null;
  };

  // ---- Names hidden in the page title --------------------------------------
  const JOB_SITES = /^(linkedin|indeed(\.com)?|glassdoor|lever|greenhouse|workday|ashby|workable|ziprecruiter|monster|dice|wellfound|angellist|built ?in|smartrecruiters|careers?|jobs?)$/i;
  const fromTitle = (raw) => {
    const out = {};
    let text = squash(raw)
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*[|–—-]\s*(LinkedIn|Indeed(\.com)?|Glassdoor|Lever|Greenhouse|Workday|Ashby|Workable|ZipRecruiter|Wellfound)\s*$/i, '');
    let match = /^Job Application for (.+?) at (.+)$/i.exec(text);
    if (match) return { title: match[1], company: match[2] };
    match = /^(.+?) hiring (.+?)(?: in (.+))?$/i.exec(text);
    if (match) return { company: match[1], title: match[2], location: match[3] || '' };
    match = /^(.+?) (?:at|@) (.+)$/i.exec(text);
    if (match) return { title: match[1], company: match[2].split(/\s[|–—-]\s/)[0] };
    const parts = text.split(/\s+[|–—-]\s+/).map(squash).filter(Boolean);
    if (parts.length >= 2) {
      if (/lever\.co$/.test(host)) return { company: parts[0], title: parts[1] };
      out.title = parts[0];
      out.company = JOB_SITES.test(parts[1]) ? '' : parts[1];
      if (parts[2] && !JOB_SITES.test(parts[2])) out.location = parts[2];
      return out;
    }
    return { title: text };
  };

  const companyFromHost = () => {
    const segment = path.split('/').filter(Boolean)[0] || '';
    if (/(^|\.)greenhouse\.io$/.test(host) && segment && segment !== 'embed') return titleCase(segment);
    if (/(^|\.)(lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|breezy\.hr)$/.test(host) && segment) {
      return titleCase(segment);
    }
    let match = /^([^.]+)\.wd\d+\.myworkdayjobs\.com$/.exec(host);
    if (match) return titleCase(match[1]);
    match = /^([^.]+)\.(bamboohr|recruitee|teamtailor|jobvite|applytojob|breezy)\./.exec(host);
    if (match) return titleCase(match[1]);
    const label = host.split('.').slice(-2, -1)[0] || host.split('.')[0] || '';
    if (!label || JOB_SITES.test(label)) return '';
    return titleCase(label);
  };

  // ---- Page-specific selectors for the common job boards -------------------
  const titleNode = first([
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    '.jobsearch-JobInfoHeader-title',
    '[data-automation-id="jobPostingHeader"]',
    '.posting-headline h2',
    '.app-title',
    '.job__title h1',
    '[data-test="job-title"]',
    'h1[class*="title" i]',
  ]);

  const companyNode = first([
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
    '[data-testid="inlineHeader-companyName"]',
    '[data-company-name="true"]',
    '[data-test="employer-name"]',
    '.company-name',
  ]);

  const locationNode = first([
    '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text',
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '.topcard__flavor--bullet',
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="job-location"]',
    '[data-automation-id="locations"] dd',
    '.posting-categories .location',
    '.job__location',
    '[data-test="location"]',
    '.location',
  ]);

  const descriptionNode = (() => {
    const selectors = [
      '#job-details',
      '.jobs-description__content',
      '.show-more-less-html__markup',
      '#jobDescriptionText',
      '[data-automation-id="jobPostingDescription"]',
      '[data-qa="job-description"]',
      '.posting-page [data-qa="job-description"]',
      '.job__description',
      '#content .job-post',
      '.job-description',
      '[class*="jobDescription"]',
      '[class*="job-description"]',
      '[class*="JobDescription"]',
    ];
    for (const selector of selectors) {
      let node;
      try {
        node = doc.querySelector(selector);
      } catch {
        continue;
      }
      if (node && squash(node.textContent).length > 80) return node;
    }
    return null;
  })();

  const salaryNodeText = first(
    [
      '#salaryInfoAndJobType',
      '[data-testid="jobsearch-OtherJobDetailsContainer"]',
      '.job-details-jobs-unified-top-card__job-insight',
      '.job-details-preferences-and-skills',
      '.salary',
      '[data-test="detailSalary"]',
      '[class*="salary" i]',
      '[class*="compensation" i]',
    ],
    (node) => blockText(node),
  );

  // ---- Combine, best source first ------------------------------------------
  const pageTitle = live ? document.title : squash(doc.querySelector('title')?.textContent);
  // Sites split details between og:title and the tab title, so read both.
  const metaGuess = fromTitle(meta('og:title', 'twitter:title'));
  const tabGuess = fromTitle(pageTitle);
  const titleGuess = {
    title: metaGuess.title || tabGuess.title || '',
    company: metaGuess.company || tabGuess.company || '',
    location: metaGuess.location || tabGuess.location || '',
  };
  const h1 = first(['h1']);

  const description =
    (posting?.description ? htmlToText(posting.description) : '') ||
    blockText(descriptionNode) ||
    meta('og:description', 'description');

  const salary =
    salaryFromPosting(posting) ||
    salaryFromText(salaryNodeText) ||
    salaryFromText(description) ||
    null;

  const siteName = meta('og:site_name', 'application-name');
  const org = posting?.hiringOrganization;
  const companyName = squash(
    (typeof org === 'string' ? org : org?.name) ||
      companyNode ||
      titleGuess.company ||
      (siteName && !JOB_SITES.test(siteName) ? siteName : '') ||
      companyFromHost(),
  );

  let deadline = '';
  if (posting?.validThrough) {
    const date = new Date(posting.validThrough);
    if (!Number.isNaN(date.getTime())) {
      const pad = (num) => String(num).padStart(2, '0');
      deadline = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
  }

  // Point LinkedIn search results at the job itself so the saved link opens it.
  let postingUrl = url;
  try {
    const parsed = new URL(url);
    const currentJobId = parsed.searchParams.get('currentJobId');
    if (/linkedin\.com$/.test(host) && currentJobId) {
      postingUrl = `https://www.linkedin.com/jobs/view/${currentJobId}/`;
    } else {
      const indeedKey = parsed.searchParams.get('vjk') || parsed.searchParams.get('jk');
      if (/indeed\./.test(host) && indeedKey) postingUrl = `${parsed.origin}/viewjob?jk=${indeedKey}`;
    }
  } catch {
    // Keep the URL as given.
  }

  return {
    url: postingUrl,
    title: squash(posting?.title || titleNode || titleGuess.title || h1).slice(0, 200),
    companyName: companyName.slice(0, 200),
    location: squash(locationFromPosting(posting) || locationNode || titleGuess.location || '').slice(0, 200),
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency || '',
    deadline,
    description: description.slice(0, 30000),
  };
}
