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
import assert from 'assert';
import { Nock } from './utils.js';
import awsSecretsPlugin from '../src/aws-secrets.js';

describe('Secrets tests for AWS', () => {
  let processEnvCopy;
  let nock;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'fake';
    process.env.AWS_SECRET_ACCESS_KEY = 'fake';
    nock = new Nock();
  });

  afterEach(() => {
    process.env = processEnvCopy;
    nock.done();
  });

  it('fetches secrets', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200, {
          SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }),
        }, {
          'content-type': 'application/json',
        }];
      });

    const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });
  });

  it('caches secrets', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200, {
          SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }),
        }, {
          'content-type': 'application/json',
        }];
      });

    let plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });

    // should return cached params
    plugin = awsSecretsPlugin(() => ({}), { expiration: 1000 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
  });

  it('should recheck cache cache after configured time', async () => {
    const now = Date.now();
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200,
          { SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }) },
          { 'content-type': 'application/json' },
        ];
      });

    let plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });

    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200,
          { LastChangedDate: now / 1000 }, { 'content-type': 'application/json' },
        ];
      });

    plugin = awsSecretsPlugin(() => ({}), { expiration: 1000, checkDelay: 1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
  });

  it('should reload cache if settings changed', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200,
          { SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }) },
          { 'content-type': 'application/json' },
        ];
      });

    let plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });

    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(() => [200,
        { LastChangedDate: (Date.now() / 1000) + 60 },
        { 'content-type': 'application/json' },
      ])
      .post('/')
      .reply(() => [200,
        { SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }) },
        { 'content-type': 'application/json' },
      ]);

    plugin = awsSecretsPlugin(() => ({}), { expiration: 1000, checkDelay: 1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
  });

  it('handles error in check cache', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply((uri, body) => {
        assert.strictEqual(body, '{"SecretId":"/helix-deploy/helix3/all"}');
        return [200,
          { SecretString: JSON.stringify({ SOME_SECRET: 'pssst' }) },
          { 'content-type': 'application/json' },
        ];
      });

    let plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });

    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(429, '', {
        'x-amzn-errortype': 'ThrottlingException',
      });

    plugin = awsSecretsPlugin(() => ({}), { expiration: 1000, checkDelay: 1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
  });

  it('handles errors from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(500)
      .persist();
    const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await assert.rejects(plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' }));
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });
  });

  it('handles 400 from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(400, '', {
        'x-amzn-errortype': 'ResourceNotFoundException',
      });
    const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });
  });

  it('handles 400 JSON response from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(400, JSON.stringify({
        __type: 'ResourceNotFoundException', Message: 'Secrets Manager can\'t find the specified secret.',
      }), {
        'content-type': 'application/x-amz-json-1.1',
      });
    const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
  });

  it('handles 429 from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .reply(429, '', {
        'x-amzn-errortype': 'ThrottlingException',
      })
      .persist();
    try {
      const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
      await plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' });
      assert.fail('expect rejection');
    } catch (e) {
      if (!e.statusCode) {
        throw e;
      }
      assert.strictEqual(e.statusCode, 429);
    }
  });

  it('handles missng AWS settings', async () => {
    const plugin = awsSecretsPlugin(() => ({}), { expiration: -1 });
    delete process.env.AWS_SECRET_ACCESS_KEY;
    await assert.rejects(
      async () => plugin({}, { invokedFunctionArn: 'arn:aws:lambda:us-east-1:118435662149:function:helix3--admin:4_3_1' }),
      /Missing AWS configuration/,
    );
  });
});
