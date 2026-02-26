#!/usr/bin/env node

const RAW_SHOP = (process.env.SHOPIFY_SHOP || '').trim();
const STATIC_ADMIN_TOKEN = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
const CLIENT_ID = (process.env.SHOPIFY_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.SHOPIFY_CLIENT_SECRET || '').trim();
const API_VERSION = (process.env.SHOPIFY_API_VERSION || '2025-10').trim();

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  const hit = args.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const applyChanges = hasFlag('apply');
const blogHandleArg = (getArg('blog-handle', 'articles') || 'articles').trim();
const articleIdArg = (getArg('article-id') || '').trim();
const limitArg = Number.parseInt(getArg('limit', '0'), 10) || 0;
const offsetArg = Number.parseInt(getArg('offset', '0'), 10) || 0;

function normalizeShopDomain(input) {
  const raw = (input || '').trim();
  if (!raw) return '';

  let host = raw.replace(/^https?:\/\//i, '').split('/')[0].trim();
  if (!host) return '';
  if (!host.includes('.')) host = `${host}.myshopify.com`;
  return host;
}

function normalizeArticleId(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('gid://shopify/Article/')) return raw;
  const numeric = raw.match(/\d+/)?.[0];
  return numeric ? `gid://shopify/Article/${numeric}` : '';
}

function countParagraphBreakIssues(html) {
  const source = String(html || '');
  return {
    leadingBrInParagraph: (source.match(/<p>\s*(?:<br\s*\/?>\s*)+/gi) || []).length,
    trailingBrInParagraph: (source.match(/(?:<br\s*\/?>\s*)+<\/p>/gi) || []).length,
    emptyParagraphs: (source.match(/<p>\s*<\/p>/gi) || []).length
  };
}

function cleanupParagraphBreaks(html) {
  let output = String(html || '');

  output = output.replace(/<p>([\s\S]*?)<\/p>/gi, (_match, inner) => {
    let cleanedInner = String(inner || '');
    cleanedInner = cleanedInner.replace(/^\s*(?:<br\s*\/?>\s*)+/gi, '');
    cleanedInner = cleanedInner.replace(/(?:<br\s*\/?>\s*)+\s*$/gi, '');

    const plain = cleanedInner
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plain) return '';
    return `<p>${cleanedInner}</p>`;
  });

  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let oauthAccessToken = null;
let oauthAccessTokenExpiresAt = 0;

async function getAccessToken(shop) {
  if (STATIC_ADMIN_TOKEN) return STATIC_ADMIN_TOKEN;
  if (oauthAccessToken && Date.now() < oauthAccessTokenExpiresAt - 60_000) return oauthAccessToken;

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = JSON.parse(text);
  if (!payload.access_token) {
    throw new Error(`Token response missing access_token: ${text.slice(0, 500)}`);
  }

  oauthAccessToken = payload.access_token;
  const expiresIn = Number(payload.expires_in || 0);
  oauthAccessTokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 0);
  return oauthAccessToken;
}

async function shopifyGraphQL(shop, query, variables = {}) {
  const token = await getAccessToken(shop);
  const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }

  const payload = JSON.parse(text);
  if (payload.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(payload.errors).slice(0, 1000)}`);
  }
  return payload.data;
}

async function getBlogs(shop) {
  const query = `
    query Blogs($first: Int!, $after: String) {
      blogs(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id handle title } }
      }
    }
  `;

  const blogs = [];
  let hasNextPage = true;
  let after = null;
  while (hasNextPage) {
    const data = await shopifyGraphQL(shop, query, { first: 100, after });
    for (const edge of data.blogs.edges) blogs.push(edge.node);
    hasNextPage = Boolean(data.blogs.pageInfo.hasNextPage);
    after = data.blogs.pageInfo.endCursor;
  }
  return blogs;
}

async function getArticlesForBlog(shop, blogId) {
  const query = `
    query BlogArticles($id: ID!, $first: Int!, $after: String) {
      blog(id: $id) {
        id
        handle
        title
        articles(first: $first, after: $after, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              body
              blog { id handle }
            }
          }
        }
      }
    }
  `;

  const results = [];
  let hasNextPage = true;
  let after = null;
  while (hasNextPage) {
    const data = await shopifyGraphQL(shop, query, { id: blogId, first: 100, after });
    const connection = data.blog?.articles;
    if (!connection) break;
    for (const edge of connection.edges) {
      results.push(edge.node);
    }
    hasNextPage = Boolean(connection.pageInfo.hasNextPage);
    after = connection.pageInfo.endCursor;
  }
  return results;
}

async function getArticleById(shop, articleId) {
  const query = `
    query ArticleById($id: ID!) {
      article(id: $id) {
        id
        title
        handle
        body
        blog { id handle }
      }
    }
  `;
  const data = await shopifyGraphQL(shop, query, { id: articleId });
  return data.article;
}

async function updateArticleBody(shop, articleId, body) {
  const mutation = `
    mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
      articleUpdate(id: $id, article: $article) {
        article { id title }
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyGraphQL(shop, mutation, {
    id: articleId,
    article: { body }
  });
  return data.articleUpdate;
}

async function main() {
  const shop = normalizeShopDomain(RAW_SHOP);
  const targetArticleId = normalizeArticleId(articleIdArg);

  if (!shop || (!STATIC_ADMIN_TOKEN && (!CLIENT_ID || !CLIENT_SECRET))) {
    console.error(
      [
        'Missing Shopify auth inputs.',
        'Set:',
        '  SHOPIFY_SHOP=<your-store>.myshopify.com',
        'And one auth mode:',
        '  A) SHOPIFY_ADMIN_ACCESS_TOKEN=<admin-api-access-token>',
        '  B) SHOPIFY_CLIENT_ID=<client-id>',
        '     SHOPIFY_CLIENT_SECRET=<client-secret>'
      ].join('\n')
    );
    process.exit(1);
  }

  let articles = [];
  if (targetArticleId) {
    const article = await getArticleById(shop, targetArticleId);
    if (!article) {
      console.error(`Article not found: ${targetArticleId}`);
      process.exit(1);
    }
    articles = [article];
  } else {
    const blogs = await getBlogs(shop);
    const blog = blogs.find((b) => b.handle === blogHandleArg) || blogs[0];
    if (!blog) {
      console.error('No blogs found.');
      process.exit(1);
    }
    const all = await getArticlesForBlog(shop, blog.id);
    articles = all.slice(Math.max(0, offsetArg), limitArg > 0 ? Math.max(0, offsetArg) + limitArg : undefined);
  }

  if (articles.length === 0) {
    console.log('No target articles selected.');
    return;
  }

  console.log(`Mode: ${applyChanges ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Articles selected: ${articles.length}`);

  let changedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const totalsBefore = { leadingBrInParagraph: 0, trailingBrInParagraph: 0, emptyParagraphs: 0 };
  const totalsAfter = { leadingBrInParagraph: 0, trailingBrInParagraph: 0, emptyParagraphs: 0 };

  for (let i = 0; i < articles.length; i += 1) {
    const article = articles[i];
    const before = String(article.body || '');
    const after = cleanupParagraphBreaks(before);

    const beforeCounts = countParagraphBreakIssues(before);
    const afterCounts = countParagraphBreakIssues(after);

    totalsBefore.leadingBrInParagraph += beforeCounts.leadingBrInParagraph;
    totalsBefore.trailingBrInParagraph += beforeCounts.trailingBrInParagraph;
    totalsBefore.emptyParagraphs += beforeCounts.emptyParagraphs;

    totalsAfter.leadingBrInParagraph += afterCounts.leadingBrInParagraph;
    totalsAfter.trailingBrInParagraph += afterCounts.trailingBrInParagraph;
    totalsAfter.emptyParagraphs += afterCounts.emptyParagraphs;

    const changed = before !== after;
    if (!changed) continue;

    changedCount += 1;
    console.log(
      `[${i + 1}/${articles.length}] ${article.title} | leading ${beforeCounts.leadingBrInParagraph}->${afterCounts.leadingBrInParagraph}, trailing ${beforeCounts.trailingBrInParagraph}->${afterCounts.trailingBrInParagraph}`
    );

    if (!applyChanges) continue;

    try {
      const result = await updateArticleBody(shop, article.id, after);
      if (result.userErrors?.length) {
        throw new Error(JSON.stringify(result.userErrors));
      }
      updatedCount += 1;
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  failed update for ${article.id}: ${message}`);
    }
  }

  console.log('');
  console.log(`Changed articles: ${changedCount}/${articles.length}`);
  console.log(`Updated articles: ${updatedCount}`);
  console.log(`Failed updates : ${failedCount}`);
  console.log(`Before totals  : ${JSON.stringify(totalsBefore)}`);
  console.log(`After totals   : ${JSON.stringify(totalsAfter)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
