import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Project Structure', () => {
  it('should have required files', () => {
    const requiredFiles = [
      'index.js',
      'deploy-commands.js',
      'package.json',
      'Dockerfile',
      'docker-compose.yml'
    ];

    requiredFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      assert.ok(fs.existsSync(filePath), `${file} should exist`);
    });
  });

  it('should have commands directory', () => {
    const commandsPath = path.join(__dirname, '..', 'commands');
    assert.ok(fs.existsSync(commandsPath), 'commands directory should exist');
  });

  it('should have utils directory', () => {
    const utilsPath = path.join(__dirname, '..', 'utils');
    assert.ok(fs.existsSync(utilsPath), 'utils directory should exist');
  });

  it('should have data directory', () => {
    const dataPath = path.join(__dirname, '..', 'data');
    assert.ok(fs.existsSync(dataPath), 'data directory should exist');
  });
});

describe('LeetCode Data', () => {
  it('should have neetcode150.json', () => {
    const leetcodePath = path.join(__dirname, '..', 'data', 'neetcode150.json');
    assert.ok(fs.existsSync(leetcodePath), 'neetcode150.json should exist');
  });

  it('should have valid JSON in neetcode150.json', () => {
    const leetcodePath = path.join(__dirname, '..', 'data', 'neetcode150.json');
    const data = JSON.parse(fs.readFileSync(leetcodePath, 'utf8'));
    assert.ok(Array.isArray(data), 'leetcode data should be an array');
    assert.ok(data.length > 0, 'leetcode data should not be empty');
  });

  it('should have properly formatted neetcode problems with valid links', () => {
    const leetcodePath = path.join(__dirname, '..', 'data', 'neetcode150.json');
    const data = JSON.parse(fs.readFileSync(leetcodePath, 'utf8'));
    
    data.forEach((problem, index) => {
      assert.ok(problem.id, `Problem at index ${index} should have an id`);
      assert.ok(problem.title, `Problem at index ${index} should have a title`);
      assert.ok(problem.difficulty, `Problem at index ${index} should have a difficulty`);
      assert.ok(problem.link, `Problem at index ${index} should have a link`);
      assert.ok(
        typeof problem.link === 'string' && problem.link.startsWith('https://leetcode.com/problems/'),
        `Problem at index ${index} should link to a LeetCode problem`
      );
    });
  });
});

describe('Configuration', () => {
  it('should have config.json', () => {
    const configPath = path.join(__dirname, '..', 'config.json');
    assert.ok(fs.existsSync(configPath), 'config.json should exist');
  });

  it('should have valid JSON in config.json', () => {
    const configPath = path.join(__dirname, '..', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(typeof config === 'object', 'config should be an object');
  });
});
