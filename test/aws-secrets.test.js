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
const assert = require('assert');
const { Nock } = require('./utils.js');
const awsSecretsPlugin = require('../src/aws-secrets.js');

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

    const plugin = awsSecretsPlugin(() => ({}), { expiration: 0 });
    await plugin({}, { functionName: 'helix3--admin' });
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

    let plugin = awsSecretsPlugin(() => ({}), { expiration: 0 });
    await plugin({}, { functionName: 'helix3--admin' });
    let body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });

    // should return cached params
    plugin = awsSecretsPlugin(() => ({}), { expiration: 1 });
    process.env = { ...processEnvCopy };
    await plugin({}, { functionName: 'helix3--admin' });
    body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      SOME_SECRET: 'pssst',
    });
  });

  it('handles errors from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .times(4)
      .reply(500);
    const plugin = awsSecretsPlugin(() => ({}), { expiration: 0 });
    await assert.rejects(plugin({}, { functionName: 'helix3--admin' }));
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
    const plugin = awsSecretsPlugin(() => ({}), { expiration: 0 });
    await plugin({}, { functionName: 'helix3--admin' });
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    assert.deepStrictEqual(body, {
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fake',
      AWS_SECRET_ACCESS_KEY: 'fake',
    });
  });

  it('handles 429 from secret manager', async () => {
    nock('https://secretsmanager.us-east-1.amazonaws.com/')
      .post('/')
      .times(4)
      .reply(429, '', {
        'x-amzn-errortype': 'ThrottlingException',
      });
    const plugin = awsSecretsPlugin(() => ({}), { expiration: 0 });
    try {
      await plugin({}, { functionName: 'helix3--admin' });
      assert.fail('expect rejection');
    } catch (e) {
      assert.strictEqual(e.statusCode, 429);
    }
  });
});
