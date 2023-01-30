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

async function getGoogleSecrets(req) {
  const functionName = process.env.K_SERVICE;
  const [subdomain] = req.headers.host.split('.');
  // eslint-disable-next-line no-unused-vars
  const [country, region, ...servicename] = subdomain.split('-');
  const projectID = servicename.join('-');

  const parent = `projects/${projectID}`;
  const packageName = functionName.replace(/--.*/, '').replace(/\./g, '_');
  const name = `${parent}/secrets/helix-deploy--${packageName}/versions/latest`;
  try {
    // delay the import so that other runtimes do not have to care
    // eslint-disable-next-line import/no-unresolved,import/no-extraneous-dependencies
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');

    // hope that the credentials appear by magic
    const client = new SecretManagerServiceClient();

    const [version] = await client.accessSecretVersion({
      name,
    });

    /* c8 ignore next */
    return JSON.parse(version.payload.data.toString());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Unable to load secrets from ${name}`, err);
    return { };
  }
}

/**
 * Creates an google adapter plugin that retrieves secrets from the secret-manager.
 * @param {function} fn the lambda handler to invoke
 * @param {object} [opts] optional options
 * @param {object} [opts.emulateEnv] ignores call to secret-manager and uses the provided
 *                                   properties instead (used for testing)
 * @returns {function(*, *): Promise<*>}
 */
export default function googleSecretsPlugin(fn, opts = {}) {
  return async (req, res) => {
    const secrets = opts.emulateEnv ?? await getGoogleSecrets(req);
    // set secrets not present on process.env
    Object.entries(secrets).forEach(([key, value]) => {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
    return fn(req, res);
  };
}
