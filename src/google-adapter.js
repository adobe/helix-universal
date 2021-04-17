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
const getGoogleSecrets = require('./google-package-params.js');

const { GoogleResolver } = require('./resolver.js');

/**
 * Universal adapter for google cloud functions.
 * @param {*} req express request
 * @param {*} res express response
 */
async function google(req, res) {
  try {
    const request = new Request(`https://${req.hostname}/${process.env.K_SERVICE}${req.originalUrl}`, {
      method: req.method,
      headers: req.headers,
      // google magically does the right thing here
      body: req.rawBody,
    });

    const [subdomain] = req.headers.host.split('.');
    const [country, region, ...servicename] = subdomain.split('-');
    const [packageName, name] = process.env.K_SERVICE.split('--');

    const context = {
      resolver: new GoogleResolver(req),
      pathInfo: {
        // original: /foo?hey=bar
        suffix: req.originalUrl.replace(/\?.*/, ''),
      },
      runtime: {
        name: 'googlecloud-functions',
        region: `${country}-${region}`,
      },
      func: {
        name,
        package: packageName,
        version: process.env.K_REVISION,
        fqn: process.env.K_SERVICE,
        app: servicename.join('-'),
      },
      invocation: {
        id: req.headers['function-execution-id'],
        deadline: Number.parseInt(req.headers['x-appengine-timeout-ms'], 10) + Date.now(),
        transactionId: request.headers.get('x-transaction-id'),
        requestId: request.headers.get('x-cloud-trace-context'),
      },
      env: {
        ...process.env,
        ...(await getGoogleSecrets(process.env.K_SERVICE, servicename.join('-'))),
      },
    };

    updateProcessEnv(context);
    // eslint-disable-next-line import/no-unresolved,global-require
    const { main } = require('./main.js');

    const response = await main(request, context);
    ensureUTF8Charset(response);
    ensureInvocationId(response, context);

    Array.from(response.headers.entries()).reduce((r, [header, value]) => r.set(header, value), res.status(response.status)).send(isBinary(response.headers.get('content-type')) ? Buffer.from(await response.arrayBuffer()) : await response.text());
  } catch (e) {
    if (e instanceof TypeError && e.code === 'ERR_INVALID_CHAR') {
      // eslint-disable-next-line no-console
      console.error('invalid request header', e.message);
      res.status(400).send(e.message);
      return;
    }
    // eslint-disable-next-line no-console
    console.error('error while invoking function', e);
    res
      .status(500)
      .set('content-type', 'text/plain')
      .set('x-invocation-id', req.headers['function-execution-id'])
      .set('x-error', cleanupHeaderValue(e.message))
      .send(e.message);
  }
}

module.exports = google;
