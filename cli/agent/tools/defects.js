'use strict';

function defectConfig(env) {
  return {
    zentao: env.ZENTAO_BASE_URL && env.ZENTAO_TOKEN
      ? { baseUrl: env.ZENTAO_BASE_URL, token: env.ZENTAO_TOKEN }
      : null,
    jira: env.JIRA_BASE_URL && env.JIRA_TOKEN
      ? { baseUrl: env.JIRA_BASE_URL, email: env.JIRA_EMAIL || '', token: env.JIRA_TOKEN, jql: env.JIRA_JQL || 'ORDER BY updated DESC' }
      : null,
  };
}

async function fetchDefects({ env = process.env, source = 'auto', fetchImpl = fetch } = {}) {
  const config = defectConfig(env);
  const useZentao = (source === 'auto' || source === 'zentao') && config.zentao;
  const useJira = (source === 'auto' || source === 'jira') && config.jira;
  if (!useZentao && !useJira) {
    return {
      configured: false,
      bugs: [],
      message: '未配置禅道或 Jira。设置 ZENTAO_BASE_URL 与 ZENTAO_TOKEN，或 JIRA_BASE_URL、JIRA_EMAIL、JIRA_TOKEN。',
    };
  }
  const bugs = [];
  if (useZentao) bugs.push(...await fetchZentao(config.zentao, fetchImpl));
  if (useJira) bugs.push(...await fetchJira(config.jira, fetchImpl));
  return { configured: true, bugs, message: `读取到 ${bugs.length} 条缺陷` };
}

async function fetchZentao(config, fetchImpl) {
  const url = new URL('api.php/v1/bugs?limit=20', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  const response = await fetchImpl(url, {
    headers: { Token: config.token, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`禅道返回 HTTP ${response.status}`);
  const body = await response.json();
  const rows = body.bugs || body.data || [];
  return rows.slice(0, 20).map((bug) => ({
    source: 'zentao',
    id: String(bug.id ?? ''),
    title: String(bug.title || bug.name || ''),
    priority: String(bug.priority ?? bug.severity ?? ''),
    status: String(bug.status || ''),
  }));
}

async function fetchJira(config, fetchImpl) {
  const url = new URL('rest/api/3/search/jql', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
  url.searchParams.set('jql', config.jql);
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('fields', 'summary,priority,status');
  const headers = { Accept: 'application/json' };
  if (config.email) {
    headers.Authorization = `Basic ${Buffer.from(`${config.email}:${config.token}`).toString('base64')}`;
  } else {
    headers.Authorization = `Bearer ${config.token}`;
  }
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`Jira 返回 HTTP ${response.status}`);
  const body = await response.json();
  return (body.issues || []).slice(0, 20).map((issue) => ({
    source: 'jira',
    id: String(issue.key || ''),
    title: String(issue.fields?.summary || ''),
    priority: String(issue.fields?.priority?.name || ''),
    status: String(issue.fields?.status?.name || ''),
  }));
}

function renderDefects(bugs) {
  if (!bugs.length) return '没有读到缺陷。\n';
  return bugs.map((bug) => `- [${bug.source}] ${bug.id} ${bug.priority} ${bug.status} ${bug.title}`).join('\n') + '\n';
}

module.exports = { fetchDefects, renderDefects };
