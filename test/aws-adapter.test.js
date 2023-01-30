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
import { Headers, Request, Response } from '@adobe/fetch';
import assert from 'assert';
import esmock from 'esmock';
import { createTestPlugin, proxySecretsPlugin } from './utils.js';

import awsSecretsPlugin from '../src/aws-secrets.js';

const DEFAULT_EVENT = {
  version: '2.0',
  routeKey: 'ANY /dump',
  rawPath: '/dump',
  rawQueryString: '',
  headers: {
    accept: '*/*',
    'content-length': '0',
    host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
    'user-agent': 'curl/7.64.1',
    'x-amzn-trace-id': 'Root=1-603df0bb-05e846307a6221f72030fe68',
    'x-forwarded-for': '210.153.232.90',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https',
  },
  requestContext: {
    accountId: '118435662149',
    apiId: 'kvvyh7ikcb',
    domainName: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'kvvyh7ikcb',
    http: {
      method: 'GET',
      path: '/dump',
      protocol: 'HTTP/1.1',
      sourceIp: '210.153.232.90',
      userAgent: 'curl/7.64.1',
    },
    requestId: 'bjKNYhHcoAMEJIw=',
    routeKey: 'ANY /dump',
    stage: '$default',
    time: '02/Mar/2021:08:00:59 +0000',
    timeEpoch: 1614672059918,
  },
  isBase64Encoded: false,
};

const DEFAULT_CONTEXT = {
  getRemainingTimeInMillis: () => 30000,
  callbackWaitsForEmptyEventLoop: true,
  functionVersion: '$LATEST',
  functionName: 'dump',
  memoryLimitInMB: '128',
  logGroupName: '/aws/lambda/dump',
  logStreamName: '2021/03/02/[$LATEST]89b58159f93949f787eb8de043937bbb',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
  awsRequestId: '535f0399-9c90-4042-880e-620cfec6af55',
};

describe('Adapter tests for AWS', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('runs the function', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '4.3.1',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
            app: 'kvvyh7ikcb',
          });
          assert.ok(context.log);
          assert.strictEqual(typeof context.log.silly, 'function');
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('can invoke the raw handler', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '4.3.1',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
            app: 'kvvyh7ikcb',
          });
          return new Response('ok');
        },
      },
    });
    const res = await lambda.raw(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('default can wrap more plugins', async () => {
    const invocations = [];
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          invocations.push('main');
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': createTestPlugin('secrets', invocations),
    });
    const handler = lambda
      .with(createTestPlugin('plugin0', invocations))
      .with(createTestPlugin('plugin1', invocations));

    const res = await handler(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
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
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          invocations.push('main');
          return new Response('ok');
        },
      },
    });
    const handler = lambda
      .wrap(lambda.raw)
      .with(createTestPlugin('plugin0', invocations))
      .with(createTestPlugin('plugin1', invocations));

    const res = await handler(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(invocations, [
      'plugin1 before',
      'plugin0 before',
      'main',
      'plugin0 after',
      'plugin1 after',
    ]);
  });

  it('when run with no version in functionArn use $LATEST', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '$LATEST',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump',
            app: 'kvvyh7ikcb',
          });
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(DEFAULT_EVENT, {
      ...DEFAULT_CONTEXT,
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump',
    });
    assert.strictEqual(res.statusCode, 200);
  });

  it('provides package params, local env wins', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin, {
        SOME_SECRET: 'pssst',
        AWS_TEST_PARAM: 'abc',
      }),
    });
    process.env.AWS_TEST_PARAM = '123';
    const res = await lambda(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
      AWS_TEST_PARAM: '123',
    });
  });

  it('raw adapter doesnt call package params', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => new Response(JSON.stringify(context.env)),
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin, {
        SOME_SECRET: 'pssst',
        AWS_TEST_PARAM: 'abc',
      }),
    });
    const res = await lambda.raw(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {});
  });

  it('context.invocation', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          delete context.invocation.deadline;
          delete context.invocation.event;
          assert.deepStrictEqual(context.invocation, {
            id: '535f0399-9c90-4042-880e-620cfec6af55',
            requestId: 'bjKNYhHcoAMEJIw=',
            transactionId: 'Root=1-603df0bb-05e846307a6221f72030fe68',
          });
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain; charset=utf-8',
      'x-invocation-id': '535f0399-9c90-4042-880e-620cfec6af55',
    });
  });

  it('context.invocation (external transaction id)', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          delete context.invocation.deadline;
          delete context.invocation.event;
          assert.deepStrictEqual(context.invocation, {
            id: '535f0399-9c90-4042-880e-620cfec6af55',
            requestId: 'bjKNYhHcoAMEJIw=',
            transactionId: 'my-tx-id',
          });
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda({
      ...DEFAULT_EVENT,
      headers: {
        ...DEFAULT_EVENT.headers,
        'x-transaction-id': 'my-tx-id',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handles illegal request headers with 400', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => new Response('ok'),
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda({
      ...DEFAULT_EVENT,
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
        accept: 'жsome value',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain',
      'x-invocation-id': '535f0399-9c90-4042-880e-620cfec6af55',
    });
  });

  it('handles error in function', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          throw new Error('function kaput');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda({
      ...DEFAULT_EVENT,
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain',
      'x-error': 'function kaput',
      'x-invocation-id': '535f0399-9c90-4042-880e-620cfec6af55',
    });
  });

  it('handles error in plugin ', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          throw new Error('function kaput');
        },
      },
      '../src/aws-secrets.js': () => async () => {
        throw new Error('plugin kaput');
      },
    });
    const res = await lambda({
      ...DEFAULT_EVENT,
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.headers, {
      'content-type': 'text/plain',
      'x-error': 'plugin kaput',
      'x-invocation-id': '535f0399-9c90-4042-880e-620cfec6af55',
    });
  });

  it('flushes log', async () => {
    let logFlushed = 0;
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (req, ctx) => {
          ctx.log = {
            flush() {
              logFlushed += 1;
            },
          };
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(logFlushed, 1);
  });

  it('handle binary request body', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.deepStrictEqual(await request.json(), { goo: 'haha' });
          return new Response('okay');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      body: 'eyJnb28iOiJoYWhhIn0=',
      requestContext: {
        ...DEFAULT_EVENT.requestContext,
        http: {
          method: 'POST',
          path: '/dump',
          protocol: 'HTTP/1.1',
        },
      },
      isBase64Encoded: true,
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
        'content-type': 'application/json',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handle binary response body', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => new Response(Buffer.from('binary', 'utf-8'), {
          headers: {
            'content-type': 'application/octet-stream',
          },
        }),
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda(DEFAULT_EVENT, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.isBase64Encoded, true);
    assert.strictEqual(Buffer.from(res.body, 'base64').toString('utf-8'), 'binary');
  });

  it('handles request params', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          const url = new URL(request.url);
          assert.strictEqual(url.searchParams.get('foo'), 'bar');
          assert.strictEqual(context.pathInfo.suffix, '');
          return new Response('okay');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      rawQueryString: 'foo=bar',
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handles pathInfo', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.strictEqual(context.pathInfo.suffix, '/status');
          return new Response('okay');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      pathParameters: {
        path: 'status',
      },
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handles event cookies params', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.deepStrictEqual(request.headers.plain(), {
            cookie: 'name1=value1;name2=value2',
            host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
          });
          return new Response('okay');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      cookies: [
        'name1=value1',
        'name2=value2',
      ],
      rawQueryString: 'foo=bar',
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handles preserves cookie header', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async (request, context) => {
          assert.deepStrictEqual(request.headers.plain(), {
            cookie: 'name1=value1;name2=value2',
            host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
          });
          return new Response('okay');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      cookies: [
      ],
      rawQueryString: 'foo=bar',
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
        cookie: 'name1=value1;name2=value2',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
  });

  it('handles multiple set-cookie headers', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        // eslint-disable-next-line no-unused-vars
        main: async () => {
          const headers = new Headers();
          headers.append('set-cookie', 't=1; Secure');
          headers.append('set-cookie', 'u=2; Secure');
          return new Response('okay', { headers });
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });

    const res = await lambda({
      ...DEFAULT_EVENT,
      cookies: [
      ],
      rawQueryString: 'foo=bar',
      headers: {
        host: 'kvvyh7ikcb.execute-api.us-east-1.amazonaws.com',
      },
    }, DEFAULT_CONTEXT);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.multiValueHeaders['set-cookie'], [
      't=1; Secure',
      'u=2; Secure',
    ]);
  });

  it('can be run without requestContext', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: (request, context) => {
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '4.3.1',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
            app: 'aws-118435662149',
          });
          const { searchParams } = new URL(request.url);
          assert.strictEqual(searchParams.toString(), 'key1=value1&key2=value2&key3=value3');
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(
      {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        other: {},
      },
      DEFAULT_CONTEXT,
    );
    assert.strictEqual(res, 'ok');
  });

  it('can be run as a trigger with context.records', async () => {
    const messageBody = {
      key1: 'value1',
      key2: 'value2',
      key3: 'value3',
    };
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: async (request, context) => {
          if (context.records) {
            const { body } = context.records[0];
            // eslint-disable-next-line no-param-reassign
            request = new Request(request.url, {
              method: 'POST', body, headers: { 'content-type': 'application/json' },
            });
          }
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '4.3.1',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
            app: 'aws-118435662149',
          });
          const json = await request.json();
          assert.deepStrictEqual(json, messageBody);
          return new Response('{}', {
            headers: {
              'content-type': 'application/json',
            },
          });
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(
      {
        Records: [{
          body: JSON.stringify(messageBody, null, 2),
        }],
      },
      DEFAULT_CONTEXT,
    );
    assert.deepStrictEqual(res, {});
  });

  it('handles errors when run without requestContext', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          throw new Error('function kaput');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    await assert.rejects(async () => lambda(
      {
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
        other: {},
      },
      DEFAULT_CONTEXT,
    ));
  });

  it('throws errors for non http events', async () => {
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: () => {
          throw new Error('function kaput');
        },
      },
      '../src/aws-secrets.js': () => async () => {
        throw new Error('plugin kaput');
      },
    });
    await assert.rejects(lambda({}, DEFAULT_CONTEXT), new Error('plugin kaput'));
  });

  it('can be run as an event listener', async () => {
    const event = {
      id: '4617e102-cbce-5b5a-3162-79727cb56ec3',
      'detail-type': 'MediaConvert Job State Change',
      source: 'aws.mediaconvert',
      account: '118435662149',
      time: '2022-10-04T15:13:47Z',
      region: 'us-east-1',
      resources: [
        'arn:aws:mediaconvert:us-east-1:118435662149:jobs/1664896423845-2jjn2v',
      ],
      detail: {
        timestamp: 1664896427263,
        accountId: '118435662149',
        queue: 'arn:aws:mediaconvert:us-east-1:118435662149:queues/Default',
        jobId: '1664896423845-2jjn2v',
        status: 'PROGRESSING',
        userMetadata: {},
      },
    };
    const { lambda } = await esmock.p('../src/aws-adapter.js', {
      '../src/main.js': {
        main: async (request, context) => {
          assert.deepStrictEqual(context.invocation.event, event);
          assert.deepStrictEqual(context.func, {
            name: 'dump',
            package: 'helix-pages',
            version: '4.3.1',
            fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-pages--dump:4_3_1',
            app: 'aws-118435662149',
          });
          return new Response('ok');
        },
      },
      '../src/aws-secrets.js': proxySecretsPlugin(awsSecretsPlugin),
    });
    const res = await lambda(
      event,
      DEFAULT_CONTEXT,
    );
    assert.deepStrictEqual(res, 'ok');
  });
});
