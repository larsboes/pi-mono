export type QueryIntent = 'recall' | 'learn' | 'debug' | 'navigate' | 'general';

export interface IntentWeights {
  recencyBias: number;
  skillBoost: number;
  errorBoost: number;
  pathBoost: number;
}

export function classifyIntent(query: string): QueryIntent {
  if (
    /what did (we|i|you) (do|work|build|fix)/i.test(query) ||
    /last time/i.test(query) ||
    /yesterday/i.test(query) ||
    /previous session/i.test(query) ||
    /recently/i.test(query)
  ) {
    return 'recall';
  }

  if (
    /how does/i.test(query) ||
    /explain/i.test(query) ||
    /what is\b/i.test(query) ||
    /how do i/i.test(query) ||
    /teach me/i.test(query) ||
    /what are/i.test(query)
  ) {
    return 'learn';
  }

  if (
    /why (did|is|does|was)/i.test(query) ||
    /\berror\b/i.test(query) ||
    /\bfail/i.test(query) ||
    /broken/i.test(query) ||
    /not working/i.test(query) ||
    /\bcrash/i.test(query)
  ) {
    return 'debug';
  }

  if (
    /find.*file/i.test(query) ||
    /where is/i.test(query) ||
    /path to/i.test(query) ||
    /\blist\b.*files/i.test(query) ||
    /open.*file/i.test(query)
  ) {
    return 'navigate';
  }

  return 'general';
}

export function getIntentWeights(intent: QueryIntent): IntentWeights {
  switch (intent) {
    case 'recall':
      return { recencyBias: 2.0, skillBoost: 0.7, errorBoost: 0.7, pathBoost: 0.7 };
    case 'learn':
      return { recencyBias: 0.6, skillBoost: 2.0, errorBoost: 0.6, pathBoost: 0.6 };
    case 'debug':
      return { recencyBias: 1.0, skillBoost: 0.6, errorBoost: 2.0, pathBoost: 0.7 };
    case 'navigate':
      return { recencyBias: 0.6, skillBoost: 0.6, errorBoost: 0.6, pathBoost: 2.0 };
    case 'general':
      return { recencyBias: 1.0, skillBoost: 1.0, errorBoost: 1.0, pathBoost: 1.0 };
  }
}

export function categorizeSource(sourcePath: string): 'daily' | 'skill' | 'error' | 'path' | 'other' {
  if (sourcePath.includes('daily/') || sourcePath.includes('DAILY/')) {
    return 'daily';
  }

  if (
    sourcePath.includes('skills/') ||
    sourcePath.endsWith('SKILL.md') ||
    sourcePath.endsWith('skill.md')
  ) {
    return 'skill';
  }

  const filename = sourcePath.split('/').pop() ?? sourcePath;
  if (
    filename.includes('error') ||
    filename.includes('bash') ||
    filename.includes('debug')
  ) {
    return 'error';
  }

  const slashCount = (sourcePath.match(/\//g) ?? []).length;
  if (
    slashCount > 1 ||
    sourcePath.endsWith('.ts') ||
    sourcePath.endsWith('.py') ||
    sourcePath.endsWith('.js') ||
    sourcePath.endsWith('.go')
  ) {
    return 'path';
  }

  return 'other';
}
