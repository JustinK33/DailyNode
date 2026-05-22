import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

describe('Project Structure', () => {
  it('has required files', () => {
    const requiredFiles = [
      'index.ts',
      'deploy-commands.ts',
      'package.json',
      'Dockerfile',
      'docker-compose.yml',
    ];

    for (const file of requiredFiles) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, file)),
        `${file} should exist`
      );
    }
  });

  it('has the expected top-level directories', () => {
    for (const dir of [
      'commands',
      'services',
      'schedulers',
      'db',
      'data',
      'lib',
    ]) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, dir)),
        `${dir} directory should exist`
      );
    }
  });
});

describe('Question datasets', () => {
  const expectedFiles = [
    'blind75.json',
    'neetcode150.json',
    'neetcode250.json',
  ];

  for (const file of expectedFiles) {
    it(`has a well-formed ${file}`, () => {
      const filePath = path.join(projectRoot, 'data', file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(Array.isArray(data), `${file} should be an array`);
      assert.ok(data.length > 0, `${file} should not be empty`);

      for (const problem of data) {
        assert.ok(problem.id, `${file}: each problem should have an id`);
        assert.ok(problem.title, `${file}: each problem should have a title`);
        assert.ok(
          problem.difficulty,
          `${file}: each problem should have a difficulty`
        );
        assert.ok(
          typeof problem.link === 'string' &&
            problem.link.startsWith('https://leetcode.com/problems/'),
          `${file}: every problem should link to a LeetCode problem`
        );
      }
    });
  }
});
