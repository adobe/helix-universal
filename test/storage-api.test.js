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
import path from 'path';
import { AWSStorage } from '../src/aws-storage.js';
import { GoogleStorage } from '../src/google-storage.js';
import Storage from '../src/storage-api.js';

describe('AWS Storage API Unit Tests', () => {
  let processEnvCopy;

  beforeEach(() => {
    processEnvCopy = { ...process.env };
    process.env.AWS_ACCESS_KEY_ID = 'fake';
    process.env.AWS_SECRET_ACCESS_KEY = 'fake';
  });

  afterEach(() => {
    process.env = processEnvCopy;
  });

  it('Sign URL for PUT', async () => {
    const res = await AWSStorage.presignURL('helix3-prototype-fallback-public', 'index.md', {}, 'PUT', 120);
    assert.ok(res);
    assert.ok(res.startsWith('https://helix3-prototype-fallback-public.s3.amazonaws.com/index.md?AWSAccessKeyId=fake'), `${res} is invalid`);
  });

  it('Sign URL for PUT with content type', async () => {
    const res = await AWSStorage.presignURL('helix3-prototype-fallback-public', 'index.md', {
      ContentType: 'application/json',
    }, 'PUT', 120);
    assert.ok(res);
    assert.ok(res.startsWith('https://helix3-prototype-fallback-public.s3.amazonaws.com/index.md?AWSAccessKeyId=fake&Content-Type=application%2Fjson'), `${res} is invalid`);
  });

  it('Sign URL for GET', async () => {
    process.env.AWS_REGION = 'us-east-1';
    const res = await AWSStorage.presignURL('helix3-prototype-fallback-public', '/index.md');
    assert.ok(res);
    assert.ok(res.startsWith('https://helix3-prototype-fallback-public.s3.amazonaws.com/index.md?AWSAccessKeyId=fake'), `${res} is invalid`);
  });
});

// if this test fails, set env GOOGLE_APPLICATION_CREDENTIALS to point to a valid credential file
describe('Google Storage API Unit Tests', () => {
  beforeEach(() => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__testdir, 'expired-google-credentials.json');
  });

  it('Sign URL for PUT', async () => {
    const res = await GoogleStorage.presignURL('helix3-prototype-fallback-public', 'index.md', {}, 'PUT', 120);
    assert.ok(res);
    assert.ok(res.startsWith('https://storage.googleapis.com/helix3-prototype-fallback-public/index.md?X-Goog-Algorithm=GOOG4-RSA-SHA256'), `${res} is invalid`);
  });

  it('Sign URL for PUT with content type', async () => {
    const res = await GoogleStorage.presignURL('helix3-prototype-fallback-public', 'index.md', {
      ContentType: 'application/json',
    }, 'PUT', 120);
    assert.ok(res);
    assert.ok(res.startsWith('https://storage.googleapis.com/helix3-prototype-fallback-public/index.md?X-Goog-Algorithm=GOOG4-RSA-SHA256'), `${res} is invalid`);
  });

  it('Sign URL for GET', async () => {
    const res = await GoogleStorage.presignURL('helix3-prototype-fallback-public', '/index.md');
    assert.ok(res);
    assert.ok(res.startsWith('https://storage.googleapis.com/helix3-prototype-fallback-public/index.md?X-Goog-Algorithm=GOOG4-RSA-SHA256'), `${res} is invalid`);
  });
});

describe('Generic Storage API Unit Tests', () => {
  it('Sign URL for PUT', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await Storage.presignURL('helix3-prototype-fallback-public', '/index.md', {}, 'PUT', 120);
    assert.equal(res, '');
  });

  it('Sign URL for GET', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await Storage.presignURL('helix3-prototype-fallback-public', '/index.md');
    assert.equal(res, '');
  });
});
