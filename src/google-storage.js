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
import AbstractStorage from './storage-api.js';

let storage;

export class GoogleStorage extends AbstractStorage {
  static async presignURL(bucket, path, blobParams = {}, method = 'GET', expires = 60) {
    if (!storage) {
      // eslint-disable-next-line import/no-extraneous-dependencies
      const { Storage } = await import('@google-cloud/storage');
      storage = new Storage();
    }

    const action = method === 'PUT' ? 'write' : 'read';

    const options = {
      version: 'v4',
      action,
      expires: Date.now() + expires * 1000, // 15 minutes
      ...blobParams,
    };

    // Get a v4 signed URL for reading the file
    const [url] = await storage
      .bucket(bucket)
      .file(path.startsWith('/') ? path.substring(1) : path)
      .getSignedUrl(options);

    return url;
  }
}
