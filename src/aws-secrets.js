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
import SecretsManager from './aws-secretsmanager.js';

const CACHE_EXPIRATION = 60 * 60 * 1000; // 1 hour
const CHECK_DELAY = 60 * 1000; // 1 minute

const cache = {
  loaded: 0,
  checked: 0,
  data: null,
};

async function getLastChangedDate(sm, secretId) {
  try {
    const { LastChangedDate } = await sm.describeSecret(secretId);
    return LastChangedDate * 1000;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`unable to fetch secret description '${secretId}'`, e);
    return 0;
  }
}

async function loadAWSSecrets(sm, secretId) {
  try {
    const { SecretString } = await sm.getSecretValue(secretId);
    return JSON.parse(SecretString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`unable to load function params from '${secretId}'`, e);
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

async function getAWSSecrets(functionName, expiration, checkDelay) {
  const sm = new SecretsManager(process.env);
  const secretId = `/helix-deploy/${functionName.replace(/--.*/, '')}/all`;
  const now = Date.now();
  let lastChanged = 0;

  if (!cache.checked) {
    cache.checked = now;
  } else if (now > cache.checked + checkDelay) {
    lastChanged = await getLastChangedDate(sm, secretId);
    cache.checked = Date.now();
  }
  if (!cache.data || now > cache.loaded + expiration || lastChanged > cache.loaded) {
    const params = await loadAWSSecrets(sm, secretId);
    const nower = Date.now();
    // eslint-disable-next-line no-console
    console.info(`loaded ${Object.entries(params).length} package parameter in ${nower - now}ms`);
    cache.data = params;
    cache.loaded = nower;
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
 * @param {object} [opts.checkDelay] modification check delay in milliseconds. defaults to 1 minute.
 * @returns {function(*, *): Promise<*>}
 */
export default function awsSecretsPlugin(fn, opts = {}) {
  return async (evt, context) => {
    const expiration = opts.expiration ?? CACHE_EXPIRATION;
    const checkDelay = opts.checkDelay || CHECK_DELAY;
    const [
      /* 'arn' */, /* 'aws' */, /* 'lambda' */,
      /* region */, /* accountId */, /* 'function' */,
      functionName,
    ] = context.invokedFunctionArn.split(':');
    const secrets = opts.emulateEnv ?? await getAWSSecrets(functionName, expiration, checkDelay);
    // set secrets not present on process.env
    Object.entries(secrets).forEach(([key, value]) => {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
    return fn(evt, context);
  };
}
