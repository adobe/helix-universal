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

/* eslint-env mocha */
/* eslint-disable no-underscore-dangle */
import assert from 'assert';
import { Response } from '@adobe/fetch';
import { ensureInvocationId, ensureUTF8Charset, isBinary } from '../src/utils.js';

describe('Adapter Utils Tests: ensureUTF8Encoding', () => {
  it('defaults missing charset-type header to text/plain', async () => {
    const resp = ensureUTF8Charset(new Response());
    assert.equal(resp.headers.get('content-type'), 'text/plain; charset=utf-8');
  });

  it('ignores missing charset in non text/html header', async () => {
    const resp = ensureUTF8Charset(new Response('', {
      headers: {
        'content-type': 'text/plain',
      },
    }));
    assert.equal(resp.headers.get('content-type'), 'text/plain');
  });

  it('adds missing charset to text/html header', async () => {
    const resp = ensureUTF8Charset(new Response('', {
      headers: {
        'content-type': 'text/html',
      },
    }));
    assert.equal(resp.headers.get('content-type'), 'text/html;charset=UTF-8');
  });

  it('does not change existing charset to text/html header', async () => {
    const resp = ensureUTF8Charset(new Response('', {
      headers: {
        'content-type': 'text/html; charset=ISO-8891',
      },
    }));
    assert.equal(resp.headers.get('content-type'), 'text/html; charset=ISO-8891');
  });

  it('errors if no response', () => {
    assert.throws(() => ensureUTF8Charset(), Error('unexpected response: undefined'));
  });

  it('errors if no response headers', () => {
    assert.throws(() => ensureUTF8Charset({ body: '', status: 200 }), Error('unexpected response: no headers. is: { body: \'\', status: 200 }'));
  });

  it('errors if response is a promise', () => {
    assert.throws(() => ensureUTF8Charset(Promise.resolve()), Error('unexpected response: no headers. is: Promise { undefined }'));
  });

  it('errors if response is not an object', () => {
    assert.throws(() => ensureUTF8Charset('400'), Error('unexpected response: no headers. is: \'400\''));
  });

  it('errors if plain response headers', () => {
    assert.throws(() => ensureUTF8Charset({ headers: {} }), Error('response.headers has no method "get()"'));
  });
});

describe('Adapter Utils Tests: ensureInvocationId', () => {
  it('adds missing invocation id', async () => {
    const resp = ensureInvocationId(new Response(), {
      invocation: {
        id: 'foobar',
      },
    });
    assert.equal(resp.headers.get('x-invocation-id'), 'foobar');
  });

  it('ignores invocation id if already set', async () => {
    const resp = ensureInvocationId(new Response('', {
      headers: {
        'x-invocation-id': 'my-id',
      },
    }), {
      invocation: {
        id: 'foobar',
      },
    });
    assert.equal(resp.headers.get('x-invocation-id'), 'my-id');
  });
});

describe('Adapter Utils Tests: isBinary', () => {
  function headers(type, encoding) {
    const hdr = new Map();
    hdr.set('content-type', type);
    if (encoding) {
      hdr.set('content-encoding', encoding);
    }
    return hdr;
  }

  it('produces correct result', async () => {
    assert.ok(isBinary(headers('application/octet-stream')));
    assert.ok(isBinary(headers('image/png')));
    assert.ok(isBinary(headers('image/svg+xml')));
    assert.ok(isBinary(headers('text/yaml')));
    assert.ok(!isBinary(headers('text/html')));
    assert.ok(!isBinary(headers('application/javascript')));
    assert.ok(!isBinary(headers('application/json')));
    assert.ok(!isBinary(headers('text/xml')));
    assert.ok(isBinary(headers('text/html', 'gzip')));
  });
});
