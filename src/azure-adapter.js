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
/* eslint-disable no-param-reassign, no-underscore-dangle, import/no-extraneous-dependencies */
const { Request } = require('@adobe/helix-fetch');
const {
  isBinary, ensureUTF8Charset, ensureInvocationId, updateProcessEnv, cleanupHeaderValue,
} = require('./utils.js');
const { AzureResolver } = require('./resolver.js');

/**
 * Universal adapter for Azure functions
 * @param {object} context Azure function context
 * @param {object} req Azure function request
 * @returns {*} azure response
 */
async function azure(context, req) {
  context.log('JavaScript HTTP trigger function processed a request.');
  // eslint-disable-next-line global-require, import/no-unresolved
  const params = require('./params.json');

  let body;
  if (!/^(GET|HEAD)$/i.test(req.method)) {
    body = req.headers['content-type'] === 'application/octet-stream' ? req.body : req.rawBody;
  }
  if (req.headers['content-type'] === 'application/octet-stream' && req.headers['x-backup-content-type']) {
    req.headers['content-type'] = req.headers['x-backup-content-type'];
  }

  try {
    const request = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      // azure only detects binaries when the mime type is a/o-s so no image/png or friends
      body,
    });

    const [,,,, packageName, name, version, ...suffix] = req.url.split('/');
    const con = {
      resolver: new AzureResolver(context, req),
      pathInfo: {
        suffix: `/${suffix.join('/')}`,
      },
      runtime: {
        name: 'azure-functions',
        region: process.env.Location,
      },
      func: {
        name,
        version,
        package: packageName,
        fqn: context.executionContext.functionName,
        app: process.env.WEBSITE_SITE_NAME,
      },
      invocation: {
        id: context.invocationId,
        deadline: undefined,
        transactionId: req.headers['x-transaction-id'],
        requestId: req.headers['x-request-id'],
      },
      env: {
        ...params,
        ...process.env,
      },
      debug: Object.keys(req),
      types: [typeof req.body, typeof req.rawBody],
      headers: req.headers,
    };

    updateProcessEnv(con);
    // eslint-disable-next-line import/no-unresolved,global-require
    const { main } = require('./main.js');

    const response = await main(request, con);
    ensureUTF8Charset(response);
    ensureInvocationId(response, con);

    context.res = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      isRaw: isBinary(response.headers.get('content-type')),
      body: isBinary(response.headers.get('content-type')) ? Buffer.from(await response.arrayBuffer()) : await response.text(),
    };
  } catch (e) {
    if (e instanceof TypeError && e.code === 'ERR_INVALID_CHAR') {
      // eslint-disable-next-line no-console
      console.error('invalid request header', e.message);
      context.res = {
        status: 400,
        headers: {
          'content-type': 'text/plain',
          'x-invocation-id': context.invocationId,
        },
        body: e.message,
      };
      return;
    }
    // eslint-disable-next-line no-console
    console.error('error while invoking function', e);
    context.res = {
      status: 500,
      headers: {
        'content-type': 'text/plain',
        'x-error': cleanupHeaderValue(e.message),
        'x-invocation-id': context.invocationId,
      },
      body: e.message,
    };
  }
}

module.exports = azure;
