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
  beforeEach(() => {
    process.env.GOOGLE_TEST_PARAM = '123';
  });

  afterEach(() => {
    delete process.env.GOOGLE_TEST_PARAM;
  });

  it('handles illegal request headers with 400', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: () => new Response('ok'),
      },
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      accept: 'жsome value',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 400);
  });

  it('context.pathInfo.suffix', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          assert.equal(context.pathInfo.suffix, '/foo/bar');
          assert.ok(request);
          return new Response('okay');
        },
      },
      './google-package-params.js': () => ({}),
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.headers, {
      'content-type': 'text/plain; charset=utf-8',
      'x-invocation-id': '1234',
    });
  });

  it('provides package params, local env wins', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-package-params.js': () => ({
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
    assert.equal(res.code, 200);
    const body = JSON.parse(res.body);
    Object.keys(process.env)
      .filter((key) => key !== 'GOOGLE_TEST_PARAM')
      .forEach((key) => delete body[key]);
    assert.deepEqual(body, {
      SOME_SECRET: 'pssst',
      GOOGLE_TEST_PARAM: '123',
    });
  });

  it('raw adapter doesnt call package params', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-package-params.js': () => {
        throw Error('should not be called');
      },
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google.raw(req, res);
    assert.equal(res.code, 200);
    const body = JSON.parse(res.body);
    Object.keys(process.env).forEach((key) => delete body[key]);
    assert.deepEqual(body, {
    });
  });

  it('adapter catches error in secrets fetching', async () => {
    process.env.K_SERVICE = 'helix-services--content-proxy';
    process.env.K_REVISION = '4.3.1';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      './google-package-params.js': () => {
        throw Error('something went wrong');
      },
    });

    const req = createMockRequest('/helix-services--content-proxy_4.3.1/foo/bar', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 500);
    assert.equal(res.headers['x-error'], 'something went wrong');
  });

  it('context.func', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          assert.deepEqual(context.func, {
            name: 'simple-name',
            package: 'simple-package',
            version: '1.45.0',
            fqn: 'simple-package--simple-name',
            app: 'helix-225321',
          });
          return new Response('ok');
        },
      },
      './google-package-params.js': () => ({}),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 200);
  });

  it('context.invocation', async () => {
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    const google = proxyquire('../src/google-adapter.js', {
      './main.js': {
        main: (request, context) => {
          delete context.invocation.deadline;
          assert.deepEqual(context.invocation, {
            id: '1234',
            requestId: 'some-request-id',
            transactionId: 'my-tx-id',
          });
          return new Response('ok');
        },
      },
      './google-package-params.js': () => ({}),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
      'x-transaction-id': 'my-tx-id',
      'x-cloud-trace-context': 'some-request-id',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 200);
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
      './google-package-params.js': () => ({}),
    });
    const req = createMockRequest('/api/simple-package/simple-name/1.45.0/foo', {
      host: 'us-central1-helix-225321.cloudfunctions.net',
      'function-execution-id': '1234',
    });
    const res = createMockResponse();
    await google(req, res);
    assert.equal(res.code, 500);
    assert.deepEqual(res.headers, {
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
        '@noCallThru': true,
      },
      './google-package-params.js': () => ({}),
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
});