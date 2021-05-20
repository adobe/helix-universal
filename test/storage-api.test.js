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
const AWSStorage = require('../src/aws-storage');
const Storage = require('../src/storage-api');

describe('AWS Storage API Unit Tests', () => {
  it('Sign URL for PUT', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await AWSStorage.presignURL('helix3-prototype-fallback-public', '/index.md', 'PUT', 120);
    assert.ok(res);
    assert.equal(res, 'https://dummy');
  });

  it('Sign URL for GET', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await AWSStorage.presignURL('helix3-prototype-fallback-public', '/index.md');
    assert.ok(res);
  });
});

describe('Generic Storage API Unit Tests', () => {
  it('Sign URL for PUT', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await Storage.presignURL('helix3-prototype-fallback-public', '/index.md', 'PUT', 120);
    assert.equal(res, '');
  });

  it('Sign URL for GET', async () => {
    // https://helix3-prototype-fallback-public.s3.us-east-1.amazonaws.com/
    const res = await Storage.presignURL('helix3-prototype-fallback-public', '/index.md');
    assert.equal(res, '');
  });
});
