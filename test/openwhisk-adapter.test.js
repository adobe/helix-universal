/*
 * Copyright 2020 Adobe. All rights reserved.
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
/* eslint-disable no-underscore-dangle */
import assert from 'assert';
import esmock from 'esmock';
import { Response } from '@adobe/fetch';
import { createTestPlugin } from './utils.js';

describe('OpenWhisk Adapter Test', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
    process.env.__OW_NAMESPACE = 'helix-pages';
    process.env.__OW_ACTION_NAME = '/helix/simple-package/simple-name@4.2.1';
    process.env.__OW_ACTIVATION_ID = '1234';
    process.env.__OW_API_HOST = 'https://test.com';
    process.env.__OW_DEADLINE = '1984';
    process.env.__OW_TRANSACTION_ID = 'ow-tx-id';
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('set correct context and environment', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req, context) => {
          const ret = JSON.stringify({
            func: context.func,
            invocation: context.invocation,
            env: Object.fromEntries(
              Object.entries(process.env)
                .filter(([key]) => key.startsWith('HELIX_UNIVERSAL')),
            ),
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      __ow_headers: {
        'x-request-id': 'my-req-id',
      },
    });
    const body = JSON.parse(resp.body);
    assert.deepStrictEqual(body, {
      env: {
        HELIX_UNIVERSAL_APP: 'helix-pages',
        HELIX_UNIVERSAL_NAME: 'simple-name',
        HELIX_UNIVERSAL_PACKAGE: 'simple-package',
        HELIX_UNIVERSAL_RUNTIME: 'apache-openwhisk',
        HELIX_UNIVERSAL_VERSION: '4.2.1',
      },
      func: {
        app: 'helix-pages',
        fqn: '/helix/simple-package/simple-name@4.2.1',
        name: 'simple-name',
        package: 'simple-package',
        version: '4.2.1',
      },
      invocation: {
        id: '1234',
        deadline: 1984,
        transactionId: 'ow-tx-id',
        requestId: 'my-req-id',
      },
    });
  });

  it('Adapts with empty params', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: () => new Response(),

      },
    });

    const resp = await main({});
    assert.deepStrictEqual(resp, {
      body: '',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('Propagates query', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req) => {
          const ret = JSON.stringify({
            url: req.url,
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      __ow_query: 'foo=bar&zoo=42',
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        url: 'https://test.com/api/v1/web/helix/simple-package/simple-name@4.2.1?foo=bar&zoo=42',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('Propagates query and params and populates env', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req, context) => {
          const ret = JSON.stringify({
            url: req.url,
            secret: context.env.SECRET_TOKEN,
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      test: 'dummy',
      __ow_query: 'foo=bar&zoo=42',
      SECRET_TOKEN: 'xyz',
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        url: 'https://test.com/api/v1/web/helix/simple-package/simple-name@4.2.1?foo=bar&zoo=42&test=dummy',
        secret: 'xyz',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('Respects path, headers and method', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req, context) => {
          const ret = JSON.stringify({
            url: req.url,
            secret: context.env.SECRET_TOKEN,
            method: req.method,
            headers: req.headers.plain(),
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      test: 'dummy',
      __ow_query: 'foo=bar&zoo=42',
      __ow_path: '/test-suffix',
      __ow_headers: {
        'x-test-header': 42,
      },
      __ow_method: 'PUT',
      SECRET_TOKEN: 'xyz',
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        headers: {
          'x-test-header': '42',
        },
        method: 'PUT',
        secret: 'xyz',
        url: 'https://test.com/api/v1/web/helix/simple-package/simple-name@4.2.1/test-suffix?foo=bar&zoo=42&test=dummy',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-last-activation-id': '1234',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('populates body', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: async (req) => {
          const ret = JSON.stringify({
            body: await req.text(),
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      test: 'dummy',
      __ow_body: 'hello, world.',
      __ow_method: 'PUT',
      __ow_headers: {
        'content-type': 'text/plain',
      },
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        body: 'hello, world.',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-last-activation-id': '1234',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('populates binary body', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: async (req) => {
          const ret = JSON.stringify({
            body: await req.text(),
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      test: 'dummy',
      __ow_body: Buffer.from('hello, world.').toString('base64'),
      __ow_method: 'PUT',
      __ow_headers: {
        'content-type': 'application/octet-stream',
      },
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        body: 'hello, world.',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-last-activation-id': '1234',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('uses localhost if no env var', async () => {
    delete process.env.__OW_API_HOST;
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req) => {
          const ret = JSON.stringify({
            url: req.url,
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({});
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        url: 'https://localhost/api/v1/web/helix/simple-package/simple-name@4.2.1',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('respects x-forwarded-host', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: (req) => {
          const ret = JSON.stringify({
            url: req.url,
          });
          return new Response(ret);
        },

      },
    });

    const resp = await main({
      __ow_headers: {
        'x-forwarded-host': 'adobeioruntime.net,test.com',
      },
    });
    resp.body = JSON.parse(resp.body);
    assert.deepStrictEqual(resp, {
      body: {
        url: 'https://adobeioruntime.net/api/v1/web/helix/simple-package/simple-name@4.2.1',
      },
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-invocation-id': '1234',
      },
      statusCode: 200,
    });
  });

  it('responds with 500 on error', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: () => {
          throw Error('boing!');
        },

      },
    });

    const resp = await main({
      __ow_headers: {
        'x-forwarded-host': 'adobeioruntime.net,test.com',
      },
    });
    assert.deepStrictEqual(resp, {
      body: 'Internal Server Error',
      headers: {
        'Content-Type': 'text/plain',
        'x-error': 'boing!',
        'x-invocation-id': '1234',
      },
      statusCode: 500,
    });
  });

  it('text request body is decoded', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.strictEqual(await request.text(), 'hallo text');
          return new Response('okay');
        },

      },
    });

    const params = {
      __ow_body: 'hallo text',
      __ow_method: 'post',
      __ow_headers: {
        'content-type': 'text/plain',
      },
    };

    const result = await main(params);
    assert.strictEqual(result.statusCode, 200);
  });

  it('json request body is decoded', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.deepStrictEqual(await request.json(), { goo: 'haha' });
          return new Response('okay');
        },

      },
    });

    const params = {
      __ow_body: 'eyJnb28iOiJoYWhhIn0=',
      __ow_method: 'post',
      __ow_headers: {
        'content-type': 'application/json',
      },
    };

    const result = await main(params);
    assert.strictEqual(result.statusCode, 200);
  });

  it('handles illegal request headers with 400', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: () => new Response('ok'),

      },
    });
    const params = {
      __ow_method: 'get',
      __ow_headers: {
        accept: 'жsome value',
      },
    };
    const result = await main(params);
    assert.strictEqual(result.statusCode, 400);
  });

  it('handle binary response body', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async () => new Response(Buffer.from('okay', 'utf-8'), {
          headers: {
            'content-type': 'application/octet-stream',
          },
        }),

      },
    });
    const params = {
      __ow_method: 'get',
    };
    const res = await main(params);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(Buffer.from(res.body, 'base64').toString('utf-8'), 'okay');
  });

  it('default can wrap more plugins', async () => {
    const invocations = [];
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: () => {
          invocations.push('main');
          return new Response('ok');
        },
      },
    });
    const handler = main
      .with(createTestPlugin('plugin0', invocations))
      .with(createTestPlugin('plugin1', invocations));

    const params = {
      __ow_method: 'get',
    };
    const res = await handler(params);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(invocations, [
      'plugin1 before',
      'plugin0 before',
      'main',
      'plugin0 after',
      'plugin1 after',
    ]);
  });

  it('handles throwing error with custom status code', async () => {
    const { openwhisk: main } = await esmock.p('../src/openwhisk-adapter.js', {
      '../src/main.js': {
        main: () => {
          const error = new Error('unauthorized - custom message');
          error.statusCode = 403;
          throw error;
        },

      },
    });

    const resp = await main({
      __ow_headers: {
        'x-forwarded-host': 'adobeioruntime.net,test.com',
      },
    });
    assert.strictEqual(resp.statusCode, 403);
    assert.strictEqual(resp.body, 'unauthorized - custom message');
    assert.deepStrictEqual(resp.headers, {
      'Content-Type': 'text/plain',
      'x-error': 'unauthorized - custom message',
      'x-invocation-id': '1234',
    });
  });
});
