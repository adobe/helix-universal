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
const path = require('path');
const assert = require('assert');
const proxyquire = require('proxyquire');

describe('Secrets tests for Google', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, 'expired-google-credentials.json');
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('fetch secrets fails and does not add secrets', async () => {
    const googleSecretsPlugin = proxyquire('../src/google-secrets.js', {
      '@google-cloud/secret-manager': {
        SecretManagerServiceClient: {
          // does not work. probably due to `import`. wait for esm
        },
        '@global': true,
        '@runtimeGlobal': true,
      },
    });

    const plugin = googleSecretsPlugin(() => ({}));
    await plugin({
      headers: {
        host: 'us-central1-helix-225321.cloudfunctions.net',
      },
    });
    const body = { ...process.env };
    Object.keys(processEnvCopy).forEach((key) => delete body[key]);
    delete body.GOOGLE_APPLICATION_CREDENTIALS;
    assert.deepStrictEqual(body, {
      K_SERVICE: 'simple-package--simple-name',
      K_REVISION: '1.45.0',
    });
  });
});
