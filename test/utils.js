/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const util = require('util');
const nock = require('nock');

async function createTestRoot() {
  const dir = path.resolve(__dirname, 'tmp', crypto.randomBytes(16)
    .toString('hex'));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const ANSI_REGEXP = RegExp([
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))',
].join('|'), 'g');

class TestLogger {
  constructor() {
    this.messages = [];
  }

  _log(level, ...args) {
    this.messages.push(util.format(...args).replace(ANSI_REGEXP, ''));
    // eslint-disable-next-line no-console
    console[level](...args);
  }

  get output() {
    return this.messages.join('\n');
  }

  debug(...args) {
    this._log('debug', ...args);
  }

  info(...args) {
    this._log('info', ...args);
  }

  warn(...args) {
    this._log('warn', ...args);
  }

  error(...args) {
    this._log('error', ...args);
  }
}

function proxySecretsPlugin(plugin, emulateEnv = {}) {
  return function testSecretsPlugin(fn) {
    const handler = plugin(fn, { emulateEnv });
    return async (...args) => handler(...args);
  };
}

function createTestPlugin(name, invocations) {
  return function testPlugin(fn) {
    return async (...args) => {
      invocations.push(`${name} before`);
      const ret = await fn(...args);
      invocations.push(`${name} after`);
      return ret;
    };
  };
}

function Nock() {
  const scopes = {};

  let unmatched;

  function noMatchHandler(req) {
    unmatched.push(req);
  }

  function nocker(url) {
    let scope = scopes[url];
    if (!scope) {
      scope = nock(url);
      scopes[url] = scope;
    }
    if (!unmatched) {
      unmatched = [];
      nock.emitter.on('no match', noMatchHandler);
    }
    return scope;
  }

  nocker.done = () => {
    Object.values(scopes).forEach((s) => s.done());
    if (unmatched) {
      assert.deepStrictEqual(unmatched.map((req) => req.options || req), []);
      nock.emitter.off('no match', noMatchHandler);
    }
    nock.cleanAll();
  };
  return nocker;
}

module.exports = {
  TestLogger,
  proxySecretsPlugin,
  createTestPlugin,
  createTestRoot,
  Nock,
};
