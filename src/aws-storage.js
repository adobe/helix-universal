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
import Storage from './storage-api.js';

let AWS;

export class AWSStorage extends Storage {
  static async presignURL(bucket, path, blobParams = {}, method = 'GET', expires = 60) {
    if (!AWS) {
      // eslint-disable-next-line import/no-extraneous-dependencies
      AWS = (await import('aws-sdk')).default;

      AWS.config.update({
        region: process.env.AWS_REGION || 'us-east-1',
        logger: console,
      });
    }

    const s3 = new AWS.S3();

    const operation = method === 'PUT' ? 'putObject' : 'getObject';
    const params = {
      Bucket: bucket,
      Key: path.startsWith('/') ? path.substring(1) : path,
      Expires: expires,
      ...blobParams,
    };

    return s3.getSignedUrl(operation, params);
  }
}
