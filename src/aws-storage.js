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
const Storage = require('./storage-api');

let AWS;

class AWSStorage extends Storage {
  static async presignURL(bucket, path, method = 'GET', expires = 60) {
    if (!AWS) {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      AWS = require('aws-sdk');

      AWS.config.update({
        region: process.env.AWS_REGION,
        logger: console,
      });
    }

    const s3 = new AWS.S3();

    const operation = method === 'PUT' ? 'putOperation' : 'getOperation';
    const params = {
      Bucket: bucket,
      Key: path,
      Expires: expires,
    };

    return s3.getSignedUrl(operation, params);
  }
}

module.exports = AWSStorage;
