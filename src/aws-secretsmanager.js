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
const aws4 = require('aws4');
const { h1, context } = require('@adobe/fetch');

/* istanbul ignore next 7 */
const fetchContext = process.env.HELIX_FETCH_FORCE_HTTP1
  ? h1({
    userAgent: 'adobe-fetch', // static user-agent for recorded tests
  })
  : context({
    userAgent: 'adobe-fetch', // static user-agent for recorded tests
  });

/**
 * Pass a request to the AWS secrets manager
 * @param {string} target target method to invoke
 * @param {any} input input that will be passed as JSON
 * @returns {any} response object
 */
async function request(target, input) {
  const region = process.env.AWS_REGION;
  const awsConfig = {
    region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };

  if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey) {
    throw new Error('Missing AWS configuration (aws_access_key_id or aws_secret_access_key)');
  }

  try {
    const { fetch } = fetchContext;
    const opts = {
      host: `secretsmanager.${region}.amazonaws.com`,
      service: 'secretsmanager',
      region,
      method: 'POST',
      path: '/',
      body: JSON.stringify(input),
      headers: {
        'X-Amz-Target': `secretsmanager.${target}`,
        'Content-Type': 'application/x-amz-json-1.1',
      },
    };
    const req = aws4.sign(opts, {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
      sessionToken: awsConfig.sessionToken,
    });
    const resp = await fetch(`https://${req.host}${req.path}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    if (!resp.ok) {
      // AWS might actually return a JSON response in its error
      if (resp.headers.get('content-type')?.match(/^application\/x-amz-json-/)) {
        const { __type: code, Message } = await resp.json();
        const e = new Error(Message);
        e.code = code;
        throw e;
      }
      // the current tests expect the error type in this header
      const code = resp.headers.get('x-amzn-errortype');
      if (code) {
        const e = new Error();
        e.code = code;
        throw e;
      }
      throw Error(`Failed to invoke ${target} (${resp.status}): ${await resp.text()}`);
    }
    return resp.json();
  } finally {
    await fetchContext.reset();
  }
}

async function describeSecret(secretId) {
  return request('DescribeSecret', { SecretId: secretId });
}

async function getSecretValue(secretId) {
  return request('GetSecretValue', { SecretId: secretId });
}

module.exports = {
  describeSecret,
  getSecretValue,
};
