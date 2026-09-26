/**
 * Lightweight keyword extraction for job descriptions.
 *
 * The description is split into the sections a posting usually has
 * (requirements, responsibilities, preferred qualifications) and each section
 * is scanned for known skills plus frequent domain terms. Counts are taken
 * across the whole description so a chip reads "Docker 3" the same way it does
 * in the posting.
 */

const SKILL_PHRASES = [
  'machine learning',
  'deep learning',
  'natural language processing',
  'computer vision',
  'large language model',
  'data science',
  'data engineering',
  'data pipeline',
  'feature engineering',
  'model deployment',
  'model monitoring',
  'prompt engineering',
  'unit testing',
  'integration testing',
  'version control',
  'source control',
  'continuous integration',
  'continuous delivery',
  'ci/cd',
  'infrastructure as code',
  'distributed systems',
  'microservices',
  'rest api',
  'graphql',
  'web services',
  'cloud computing',
  'project management',
  'product management',
  'stakeholder management',
  'cross-functional',
  'problem solving',
  'communication skills',
  'analytical skills',
  'attention to detail',
  'customer service',
  'time management',
  'team player',
  'computer science',
  'statistical analysis',
  'a/b testing',
  'business intelligence',
  'data visualization',
  'object oriented',
  'test driven development',
];

const SKILL_WORDS = [
  'python',
  'javascript',
  'typescript',
  'java',
  'golang',
  'rust',
  'ruby',
  'php',
  'scala',
  'kotlin',
  'swift',
  'sql',
  'nosql',
  'mongodb',
  'postgresql',
  'mysql',
  'redis',
  'elasticsearch',
  'snowflake',
  'databricks',
  'spark',
  'hadoop',
  'kafka',
  'airflow',
  'dbt',
  'tensorflow',
  'pytorch',
  'keras',
  'scikit-learn',
  'sklearn',
  'pandas',
  'numpy',
  'langchain',
  'huggingface',
  'openai',
  'llm',
  'llms',
  'nlp',
  'mlops',
  'devops',
  'docker',
  'kubernetes',
  'terraform',
  'ansible',
  'jenkins',
  'github',
  'gitlab',
  'git',
  'aws',
  'azure',
  'gcp',
  'linux',
  'bash',
  'react',
  'nextjs',
  'node',
  'nodejs',
  'express',
  'angular',
  'vue',
  'django',
  'flask',
  'fastapi',
  'spring',
  'graphql',
  'api',
  'apis',
  'agile',
  'scrum',
  'kanban',
  'jira',
  'tableau',
  'powerbi',
  'excel',
  'accuracy',
  'reliability',
  'scalability',
  'security',
  'compliance',
  'confidentiality',
  'integrity',
  'automation',
  'analytics',
  'architecture',
  'collaboration',
  'containerization',
  'deployment',
  'documentation',
  'experimentation',
  'governance',
  'innovation',
  'leadership',
  'mentoring',
  'monitoring',
  'optimization',
  'performance',
  'prototyping',
  'research',
  'testing',
  'training',
  'validation',
  'adoption',
  'data',
  'modeling',
  'statistics',
  'algorithms',
  'pipelines',
];

const STOP_WORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being
  below between both but by can cannot could did do does doing down during each few for from further
  had has have having he her here hers herself him himself his how i if in into is it its itself me
  more most my myself nor not of off on once only or other ought our ours ourselves out over own same
  she should so some such than that the their theirs them themselves then there these they this those
  through to too under until up very was we were what when where which while who whom why with would
  you your yours yourself yourselves will shall may might must ability able across ensure ensures
  including include includes work working works role roles job jobs position experience years year
  strong excellent related required requires requirement requirements responsibility responsibilities
  qualification qualifications preferred plus equivalent etc within high level well new using use used
  team teams company companies candidate candidates applicants opportunity benefits salary`
    .split(/\s+/)
    .filter(Boolean),
);

const SECTION_MATCHERS = [
  {
    key: 'requirements',
    label: 'Requirements',
    pattern:
      /\b(requirements?|what you.{0,10}(need|bring)|must have|basic qualifications|minimum qualifications|skills? (and|&) experience)\b/i,
  },
  {
    key: 'responsibilities',
    label: 'Job Responsibilities',
    pattern:
      /\b(responsibilit(y|ies)|what you.{0,10}(do|will do)|duties|day to day|the role|about the role|key tasks)\b/i,
  },
  {
    key: 'preferred',
    label: 'Preferred Qualifications',
    pattern:
      /\b(preferred|nice to have|bonus|desired|pluses|good to have|additional qualifications)\b/i,
  },
];

function normalize(text) {
  return text.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ');
}

function isHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/^[-*\u2022]/.test(trimmed)) return false;
  return trimmed.endsWith(':') || /^[A-Z][A-Za-z /&'-]+$/.test(trimmed);
}

/** Splits a description into labelled sections, keeping anything before the first heading. */
export function splitSections(description = '') {
  const lines = String(description).split(/\r?\n/);
  const sections = [];
  let current = { key: 'overview', label: 'Overview', lines: [] };

  for (const line of lines) {
    if (isHeading(line)) {
      const matcher = SECTION_MATCHERS.find((candidate) => candidate.pattern.test(line));
      if (matcher) {
        if (current.lines.length) sections.push(current);
        current = { key: matcher.key, label: matcher.label, lines: [] };
        continue;
      }
    }
    current.lines.push(line);
  }
  if (current.lines.length) sections.push(current);

  return sections.map((section) => ({
    key: section.key,
    label: section.label,
    text: section.lines.join('\n').trim(),
  }));
}

function countOccurrences(haystack, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundaryStart = /^[a-z0-9]/i.test(term) ? '\\b' : '';
  const boundaryEnd = /[a-z0-9]$/i.test(term) ? '\\b' : '';
  const matches = haystack.match(new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, 'gi'));
  return matches ? matches.length : 0;
}

function extractFromText(sectionText, fullText) {
  const normalizedSection = normalize(sectionText);
  const normalizedFull = normalize(fullText);
  const found = new Map();

  const add = (term) => {
    if (found.has(term)) return;
    const count = countOccurrences(normalizedFull, term);
    if (count > 0) found.set(term, count);
  };

  for (const phrase of SKILL_PHRASES) {
    if (normalizedSection.includes(phrase)) add(phrase);
  }
  for (const word of SKILL_WORDS) {
    if (countOccurrences(normalizedSection, word) > 0) add(word);
  }

  // Fill out the list with frequent, meaningful words from the section itself.
  const frequency = new Map();
  for (const rawWord of normalizedSection.match(/[a-z][a-z0-9+#./-]{2,}/g) || []) {
    const word = rawWord.replace(/[.,/]+$/, '');
    if (word.length < 3 || STOP_WORDS.has(word) || found.has(word)) continue;
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  for (const [word, count] of [...frequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    if (count > 1) add(word);
  }

  return [...found.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

function titleCase(term) {
  const upper = new Set([
    'aws',
    'gcp',
    'sql',
    'api',
    'apis',
    'nlp',
    'llm',
    'llms',
    'ci/cd',
    'mlops',
    'devops',
    'etl',
  ]);
  if (upper.has(term)) return term.toUpperCase();
  return term
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * @returns {{sections: Array<{key: string, label: string, keywords: Array<{term: string, count: number}>}>, total: number}}
 */
export function extractKeywords(description = '', limitPerSection = 12) {
  const text = String(description || '');
  if (!text.trim()) return { sections: [], total: 0 };

  const rawSections = splitSections(text);
  const wanted = ['requirements', 'responsibilities', 'preferred'];
  // A posting can repeat a section ("About the role" and "Responsibilities:" both
  // describe the job), so same-key sections are merged into a single group.
  const merged = new Map();
  for (const section of rawSections) {
    if (!wanted.includes(section.key)) continue;
    const existing = merged.get(section.key);
    if (existing) existing.text = `${existing.text}\n${section.text}`;
    else merged.set(section.key, { ...section });
  }
  // A posting without recognisable headings still gets one combined group.
  const groups = merged.size
    ? wanted.filter((key) => merged.has(key)).map((key) => merged.get(key))
    : [{ key: 'requirements', label: 'Requirements', text }];

  const seen = new Set();
  const sections = groups.map((section) => {
    const keywords = extractFromText(section.text, text)
      .filter((keyword) => {
        if (seen.has(keyword.term)) return false;
        seen.add(keyword.term);
        return true;
      })
      .slice(0, limitPerSection)
      .map((keyword) => ({ ...keyword, label: titleCase(keyword.term) }));
    return { key: section.key, label: section.label, keywords };
  });

  const total = sections.reduce((sum, section) => sum + section.keywords.length, 0);
  return { sections: sections.filter((section) => section.keywords.length > 0), total };
}
