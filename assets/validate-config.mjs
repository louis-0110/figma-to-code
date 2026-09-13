#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const FRAMEWORKS = ['vue2-nobuild', 'vue3-vite'];
const SCALE_MODES = ['width-adapt', 'actual', 'fit', 'fill-height', 'stretch', 'custom'];

export function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['config must be a JSON object'];
  }

  for (const field of ['contractVersion', 'framework', 'ui', 'fidelity', 'scale']) {
    if (!(field in config)) errors.push(`missing required field: ${field}`);
  }

  if ('contractVersion' in config && config.contractVersion !== 1) {
    errors.push(`contractVersion must be 1, got ${JSON.stringify(config.contractVersion)}`);
  }
  if ('framework' in config && !FRAMEWORKS.includes(config.framework)) {
    errors.push(`framework must be one of: ${FRAMEWORKS.join(', ')}`);
  }
  for (const field of ['ui', 'fidelity']) {
    if (field in config && (typeof config[field] !== 'string' || !config[field].trim())) {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if ('scale' in config && !SCALE_MODES.includes(config.scale)) {
    errors.push(`scale must be one of: ${SCALE_MODES.join(', ')}`);
  }

  if ('features' in config) {
    if (!config.features || typeof config.features !== 'object' || Array.isArray(config.features)) {
      errors.push('features must be an object');
    } else {
      for (const [name, feature] of Object.entries(config.features)) {
        const prefix = `features.${name}`;
        if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
          errors.push(`${prefix} must be an object`);
          continue;
        }
        if (typeof feature.detected !== 'boolean') {
          errors.push(`${prefix}.detected must be true or false`);
          continue;
        }
        if (!feature.detected) continue;
        if (typeof feature.lib !== 'string' || !feature.lib.trim()) {
          errors.push(`${prefix}.lib is required when detected is true`);
        }
        if (!Array.isArray(feature.nodes) || feature.nodes.length === 0) {
          errors.push(`${prefix}.nodes is required when detected is true`);
        } else if (feature.nodes.some((node) => typeof node !== 'string' || !node.trim())) {
          errors.push(`${prefix}.nodes must contain non-empty Figma node IDs`);
        }
      }
    }
  }

  return errors;
}

function projectRoot(input) {
  const path = isAbsolute(input) ? input : resolve(process.cwd(), input);
  return path.replace(/[\\/]codegen\.config\.json$/i, '');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${path}: ${error.message}`);
  }
}

function printUsage() {
  process.stdout.write('Usage: node validate-config.mjs <config.json-or-project-root>\n');
}

async function main() {
  const input = process.argv[2];
  if (!input || input === '--help' || input === '-h') {
    printUsage();
    process.exitCode = input ? 0 : 1;
    return;
  }

  const root = projectRoot(input);
  const configPath = /\.json$/i.test(input) ? resolve(input) : resolve(root, 'codegen.config.json');
  const config = await readJson(configPath);
  const errors = validateConfig(config);
  if (errors.length) {
    process.stderr.write(`INVALID ${configPath}\n`);
    for (const error of errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`VALID ${configPath} (contractVersion ${config.contractVersion})\n`);
}

if (process.argv[1] && process.argv[1].endsWith("validate-config.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
