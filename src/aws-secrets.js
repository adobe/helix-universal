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
  date: 0,
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

async function getAWSSecrets(functionName, expiration) {
  const now = Date.now();
  if (!cache.data || now > cache.date + expiration) {
    const params = await loadAWSSecrets(functionName);
    const nower = Date.now();
    // eslint-disable-next-line no-console
    console.info(`loaded ${Object.entries(params).length} package parameter in ${nower - now}ms`);
    cache.data = params;
    cache.date = nower;
  }
  return cache.data;
}

/**
 * Creates an aws adapter plugin that retrieves secrets from the secrets manager.
 * @param {function} fn the lambda handler to invoke
 * @param {object} [opts] optional options
 * @param {object} [opts.emulateEnv] ignores call to secrets manager and uses the provided
 *                                   properties instead (used for testing)
 * @param {object} [opts.expiration] cache expiration time in milliseconds. defaults to 1 hour.
 * @returns {function(*, *): Promise<*>}
 */
function awsSecretsPlugin(fn, opts = {}) {
  return async (evt, context) => {
    const expiration = opts.expiration ?? CACHE_EXPIRATION;
    const secrets = opts.emulateEnv ?? await getAWSSecrets(context.functionName, expiration);
    // set secrets not present on process.env
    Object.entries(secrets).forEach(([key, value]) => {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
    return fn(evt, context);
  };
}

module.exports = awsSecretsPlugin;
