#!/usr/bin/env node
/**
 * Speech-to-text transcription using Groq Whisper API
 * 
 * Usage:
 *   transcribe.mjs <file> [options]
 *   transcribe.mjs --batch <file-list.txt> [options]
 * 
 * Options:
 *   --format <format>      Output: text (default), json, srt, vtt
 *   --output <file>        Output file (default: stdout)
 *   --model <model>        Model: whisper-large-v3-turbo (default), whisper-large-v3
 *   --language <lang>      Language code (auto-detect if not specified)
 *   --translate            Translate to English
 *   --batch <file>         Process multiple files (one per line)
 *   --parallel <n>         Parallel batch jobs (default: 2)
 *   --verbose              Show progress
 * 
 * Environment:
 *   GROQ_API_KEY           Required API key
 * 
 * Examples:
 *   transcribe.mjs meeting.m4a
 *   transcribe.mjs podcast.mp3 --format srt --output podcast.srt
 *   transcribe.mjs interview.wav --format json --language de
 *   transcribe.mjs --batch files.txt --parallel 3 --verbose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'config.json');

// API configuration
const API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];
const FORMATS = ['text', 'json', 'srt', 'vtt'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Supported audio formats
const SUPPORTED_EXTS = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.webm', '.mp4', '.mpeg', '.mpga', '.oga'];

function loadConfig() {
  // First try environment variable
  if (process.env.GROQ_API_KEY) {
    return { apiKey: process.env.GROQ_API_KEY };
  }
  
  // Then try config file
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.apiKey) return config;
    } catch (e) {
      // Invalid config file
    }
  }
  
  // Try old shell config format
  const oldConfigFile = path.join(__dirname, 'config');
  if (fs.existsSync(oldConfigFile)) {
    const content = fs.readFileSync(oldConfigFile, 'utf-8');
    const match = content.match(/GROQ_API_KEY=["']?([^"'\n]+)["']?/);
    if (match) return { apiKey: match[1] };
  }
  
  return null;
}

function saveConfig(apiKey) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ apiKey }, null, 2));
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${formatBytes(stats.size)} (max: ${formatBytes(MAX_FILE_SIZE)})`);
  }
  
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTS.includes(ext)) {
    console.warn(`Warning: Extension ${ext} may not be supported. Supported: ${SUPPORTED_EXTS.join(', ')}`);
  }
  
  return stats;
}

async function transcribe(filePath, options = {}) {
  const config = loadConfig();
  if (!config?.apiKey) {
    throw new Error(
      'GROQ_API_KEY not set.\n' +
      'Set environment variable: export GROQ_API_KEY="your-key"\n' +
      'Or run: transcribe.mjs --config "your-key"'
    );
  }
  
  validateFile(filePath);
  
  const model = options.model || 'whisper-large-v3-turbo';
  const format = options.format || 'text';
  const language = options.language || '';
  const translate = options.translate || false;
  
  if (!MODELS.includes(model)) {
    throw new Error(`Unknown model: ${model}. Use: ${MODELS.join(', ')}`);
  }
  
  if (!FORMATS.includes(format)) {
    throw new Error(`Unknown format: ${format}. Use: ${FORMATS.join(', ')}`);
  }
  
  // Build curl command
  const args = [
    '-s', '-X', 'POST', API_URL,
    '-H', `Authorization: Bearer ${config.apiKey}`,
    '-F', `file=@${filePath}`,
    '-F', `model=${model}`,
    '-F', `response_format=${format}`
  ];
  
  if (language) {
    args.push('-F', `language=${language}`);
  }
  
  if (translate) {
    args.push('-F', 'task=translate');
  }
  
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', args, { encoding: 'utf-8' });
    let stdout = '';
    let stderr = '';
    
    curl.stdout.on('data', (data) => {
      stdout += data;
    });
    
    curl.stderr.on('data', (data) => {
      stderr += data;
    });
    
    curl.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`curl failed: ${stderr || 'unknown error'}`));
      } else {
        resolve(stdout);
      }
    });
    
    curl.on('error', (err) => {
      reject(new Error(`Failed to run curl: ${err.message}`));
    });
  });
}

async function batchProcess(batchFile, options = {}) {
  const files = fs.readFileSync(batchFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  
  const parallel = options.parallel || 2;
  const results = [];
  
  console.error(`Batch processing ${files.length} file(s) with ${parallel} parallel job(s)...`);
  
  // Process in chunks
  for (let i = 0; i < files.length; i += parallel) {
    const chunk = files.slice(i, i + parallel);
    
    if (options.verbose) {
      console.error(`Processing chunk ${Math.floor(i/parallel) + 1}/${Math.ceil(files.length/parallel)}: ${chunk.join(', ')}`);
    }
    
    const chunkPromises = chunk.map(async (file) => {
      try {
        const result = await transcribe(file, options);
        return { file, success: true, result };
      } catch (err) {
        return { file, success: false, error: err.message };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    
    // Progress report
    const completed = Math.min(i + parallel, files.length);
    const successCount = results.filter(r => r.success).length;
    console.error(`Progress: ${completed}/${files.length} (${successCount} successful)`);
  }
  
  return results;
}

function usage() {
  console.log(`Usage: transcribe.mjs <file> [options]
       transcribe.mjs --batch <file-list.txt> [options]

Options:
  --format <format>      Output: text (default), json, srt, vtt
  --output <file>        Output file (default: stdout)
  --model <model>        Model: whisper-large-v3-turbo, whisper-large-v3
  --language <lang>      Language code (auto-detect if not specified)
  --translate            Translate to English
  --batch <file>         Process multiple files (one per line)
  --parallel <n>         Parallel batch jobs (default: 2)
  --verbose              Show progress
  --config <api-key>     Save API key to config

Environment:
  GROQ_API_KEY           API key (alternative to config file)

Examples:
  transcribe.mjs meeting.m4a
  transcribe.mjs podcast.mp3 --format srt --output podcast.srt
  transcribe.mjs interview.wav --format json --language de
  transcribe.mjs --batch files.txt --parallel 3 --verbose
`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }
  
  // Handle config save
  const configIdx = args.indexOf('--config');
  if (configIdx !== -1) {
    const apiKey = args[configIdx + 1];
    if (!apiKey) {
      console.error('Error: --config requires an API key');
      process.exit(1);
    }
    saveConfig(apiKey);
    console.log('API key saved to config.json');
    process.exit(0);
  }
  
  // Parse options
  const options = {};
  let inputFile = null;
  let outputFile = null;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--format':
        options.format = args[++i];
        break;
      case '--output':
        outputFile = args[++i];
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--language':
        options.language = args[++i];
        break;
      case '--translate':
        options.translate = true;
        break;
      case '--batch':
        options.batch = args[++i];
        break;
      case '--parallel':
        options.parallel = parseInt(args[++i], 10);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (!arg.startsWith('--') && !inputFile) {
          inputFile = arg;
        }
        break;
    }
  }
  
  try {
    let output = '';
    
    if (options.batch) {
      // Batch mode
      const results = await batchProcess(options.batch, options);
      
      // Format output
      if (options.format === 'json') {
        output = JSON.stringify(results, null, 2);
      } else {
        output = results.map(r => {
          if (r.success) {
            return `=== ${r.file} ===\n${r.result}\n`;
          } else {
            return `=== ${r.file} ===\nERROR: ${r.error}\n`;
          }
        }).join('\n');
      }
    } else if (inputFile) {
      // Single file mode
      if (options.verbose) {
        console.error(`Transcribing: ${inputFile}`);
      }
      output = await transcribe(inputFile, options);
    } else {
      console.error('Error: No input file specified');
      usage();
      process.exit(1);
    }
    
    // Output result
    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      console.error(`Output saved to: ${outputFile}`);
    } else {
      console.log(output);
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
