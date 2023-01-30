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
import path from 'path';
import assert from 'assert';
import esmock from 'esmock';

class MockSecretManagerServiceClient {
  // eslint-disable-next-line class-methods-use-this
  accessSecretVersion({ name }) {
    if (name === 'projects/helix-225321/secrets/helix-deploy--fail/versions/latest') {
      throw Error();
    }
    return [{
      payload: {
        data: '{ "foo": "bar" }',
      },
    }];
  }
}

describe('Secrets tests for Google', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
    process.env.K_SERVICE = 'simple-package--simple-name';
    process.env.K_REVISION = '1.45.0';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__testdir, 'expired-google-credentials.json');
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('fetch secrets succeeds', async () => {
    const googleSecretsPlugin = await esmock.p('../src/google-secrets.js', {
      '@google-cloud/secret-manager': {
        SecretManagerServiceClient: MockSecretManagerServiceClient,
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
      foo: 'bar',
    });
  });

  it('fetch secrets fails and does not add secrets', async () => {
    process.env.K_SERVICE = 'fail--fail';
    const googleSecretsPlugin = await esmock.p('../src/google-secrets.js', {
      '@google-cloud/secret-manager': {
        SecretManagerServiceClient: MockSecretManagerServiceClient,
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
      K_SERVICE: 'fail--fail',
      K_REVISION: '1.45.0',
    });
  });
});
