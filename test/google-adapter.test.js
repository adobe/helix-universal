/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-env mocha */
const { Response } = require('@adobe/helix-fetch');
const assert = require('assert');
const proxyquire = require('proxyquire').noCallThru();
const { proxySecretsPlugin, createTestPlugin } = require('./utils.js');
const googleSecretsPlugin = require('../src/google-secrets.js');

function createMockResponse() {
  return {
    code: 999,
    headers: {},
    status(value) {
      this.code = value;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function createMockRequest(url, headers) {
  return {
    originalUrl: url.replace(/^\/([^/]+)/, ''),
    headers,
    get(key) {
      return this.headers[key];
    },
  };
}

describe('Adapter tests for Google', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('handles illegal request headers with 400', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: () => new Response('ok'),
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),

    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      accept: 'жsome value',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 400);
  });

  it('context.pathInfo.suffix', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          assert.strictEqual(context.pathInfo.suffix, '/foo/bar');
          assert.ok(request);
          return new Response('okay');
        },
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain; charset=utf-8',
      'x-invocation-id': '1234',
    });
  });

  it('provides package params, local env wins', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    process.env.GOOGLE_TEST_PARAM = '123';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin, {
        SOME_SECRET: 'pssst',
        GOOGLE_TEST_PARAM: 'abc',
      }),
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 200);
    const body = JSON.parse(res.body);
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
      GOOGLE_TEST_PARAM: '123',
      K_REVISION: '4.3.1',
      K_SERVICE: 'helix-services--content-proxy',
    });
  });

  it('raw adapter doesnt call package params', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-secrets.js': () => async () => {
        throw new Error('plugin kaput');
      },
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google.raw(req, res);
    assert.strictEqual(res.code, 200);
    const body = JSON.parse(res.body);
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      K_REVISION: '4.3.1',
      K_SERVICE: 'helix-services--content-proxy',
    });
  });

  it('adapter catches error in secrets fetching', async () => {
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-secrets.js': () => async () => {
        throw new Error('something went wrong');
      },
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 500);
    assert.strictEqual(res.headers['x-error'], 'something went wrong');
  });

  it('invokes function', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          assert.deepStrictEqual(context.func, {
            name: 'simple-name',
            package: 'simple-package',
            version: '1.45.0',
            fqn: 'simple-package--simple-name',
            app: 'helix-225321',
          });
          return new Response('ok');
        },
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 200);
  });

  it('context.invocation', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          delete context.invocation.deadline;
          assert.deepStrictEqual(context.invocation, {
            id: '1234',
            requestId: 'some-request-id',
            transactionId: 'my-tx-id',
          });
          return new Response('ok');
        },
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
      'x-transaction-id': 'my-tx-id',
      'x-cloud-trace-context': 'some-request-id',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 200);
  });

  it('handles error in function', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: () => {
          throw new Error('function kaput');
        },
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.strictEqual(res.code, 500);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain',
      'x-error': 'function kaput',
      'x-invocation-id': '1234',
    });
  });

  it('handle binary response body', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async () => new Response(Buffer.from('okay', 'utf-8'), {
          headers: {
            'content-type': 'application/octet-stream',
          },
        }),
      },
      './google-secrets.js': proxySecretsPlugin(googleSecretsPlugin),
    });

    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
    });
    const res = createMockResponse();
    await google(req, res);

    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.body.toString('utf-8'), 'okay');
    assert.ok(Buffer.isBuffer(res.body));
  });

  it('default can wrap more plugins', async () => {
    const invocations = [];
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: () => {
          invocations.push('main');
          return new Response('ok');
        },
      },
      './google-secrets.js': createTestPlugin('secrets', invocations),
    });
    const handler = google
      .with(createTestPlugin('plugin0', invocations))
      .with(createTestPlugin('plugin1', invocations));

    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
    });
    const res = createMockResponse();
    await handler(req, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(invocations, [
      'plugin1 before',
      'plugin0 before',
      'secrets before',
      'main',
      'secrets after',
      'plugin0 after',
      'plugin1 after',
    ]);
  });

  it('default can wrap raw adapter plugins', async () => {
    const invocations = [];
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: () => {
          invocations.push('main');
          return new Response('ok');
        },
      },
    });
    const handler = google.wrap(google.raw)
      .with(createTestPlugin('plugin0', invocations))
      .with(createTestPlugin('plugin1', invocations));

    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
    });
    const res = createMockResponse();
    await handler(req, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(invocations, [
      'plugin1 before',
      'plugin0 before',
      'main',
      'plugin0 after',
      'plugin1 after',
    ]);
  });
});
