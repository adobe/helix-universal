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
const { promisify } = require('util');

const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 hour

const cache = {
  expiration: 0,
  data: null,
};

async function loadAWSSecrets(functionName) {
  // delay the import so that other runtimes do not have to care
  // eslint-disable-next-line import/no-extraneous-dependencies
  const AWS = (await import('aws-sdk')).default;

  AWS.config.update({
    region: process.env.AWS_REGION,
    logger: console,
  });

  const sm = new AWS.SecretsManager();
  sm.getSecretValue = promisify(sm.getSecretValue.bind(sm));

  const SecretId = `/helix-deploy/${functionName.replace(/--.*/, '')}/all`;
  try {
    const { SecretString } = await sm.getSecretValue({ SecretId });
    return JSON.parse(SecretString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`unable to load function params from '${SecretId}'`, e);
    const error = new Error('unable to load function params');
    if (e.code === 'ThrottlingException') {
      error.statusCode = 429;
    }
    if (e.code === 'ResourceNotFoundException') {
      return {};
    }
    throw error;
  }
}

async function getAWSSecrets(functionName) {
  const now = Date.now();
  if (!cache.data || now > cache.expiration) {
    const params = await loadAWSSecrets(functionName);
    const nower = Date.now();
    // eslint-disable-next-line no-console
    console.info(`loaded ${Object.entries(params).length} package parameter in ${nower - now}ms`);
    if (params) {
      cache.data = params;
      cache.expiration = nower + CACHE_EXPIRATION;
    }
  }
  return cache.data;
}

module.exports = getAWSSecrets;
