#!/usr/bin/env node
/**
 * Store text to Cortex memory system.
 * Reads text from stdin, metadata from argv[1] (JSON string).
 */

import { spawnSync } from 'child_process';

const metadata = JSON.parse(process.argv[1] || '{}');

let text = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { text += chunk; });
process.stdin.on('end', () => {
  const memoryText = `[Document Summary] Source: ${metadata.source || 'unknown'}\n\n${text}`;
  
  // Use pi's memory_store tool via bash
  const result = spawnSync('pi', [
    '--no-tools',
    '--no-session',
    '-p',
    `Please store this in memory: ${JSON.stringify(memoryText)}`
  ], {
    encoding: 'utf-8',
    timeout: 30000
  });

  if (result.error || result.status !== 0) {
    console.error('Failed to store memory:', result.stderr || result.error);
    process.exit(1);
  }
  
  process.exit(0);
});
