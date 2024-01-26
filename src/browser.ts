'use strict';

import {HttpVerb} from 'http-basic/lib/HttpVerb';
import { IncomingHttpHeaders } from 'http';
import GenericResponse = require('http-response-object');
import Promise = require('promise');
import {Options} from './Options';
import toResponsePromise, {ResponsePromise} from './ResponsePromise';
import {RequestFn} from './RequestFn';
import handleQs from './handle-qs';

type Response = GenericResponse<Buffer | string>;
export {HttpVerb, IncomingHttpHeaders as Headers, Options, ResponsePromise, Response};

function request(method: HttpVerb, url: string, options: Options): ResponsePromise {
  return toResponsePromise(new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();

    // check types of arguments

    if (typeof method !== 'string') {
      throw new TypeError('The method must be a string.');
    }
    if (typeof url !== 'string') {
      throw new TypeError('The URL/path must be a string.');
    }
    if (options == null) {
      options = {};
    }
    if (typeof options !== 'object') {
      throw new TypeError('Options must be an object (or null).');
    }

    method = (method.toUpperCase() as any);


    function attempt(n: number, options: Options) {
      request(method, url, {
        qs: options.qs,
        headers: options.headers,
        timeout: options.timeout
      }).nodeify(function (err, res) {
        let retry = !!(err || res.statusCode >= 400);
        if (typeof options.retry === 'function') {
          retry = options.retry(err, res, n + 1);
        }
        if (n >= (options.maxRetries || 5)) {
          retry = false;
        }
        if (retry) {
          var delay = options.retryDelay;
          if (typeof options.retryDelay === 'function') {
            delay = options.retryDelay(err, res, n + 1);
          }
          delay = delay || 200;
          setTimeout(function () {
            attempt(n + 1, options);
          }, delay);
        } else {
          if (err) reject(err);
          else resolve(res);
        }
      });
    }
    if (options.retry && method === 'GET') {
      return attempt(0, options);
    }

    let headers = options.headers || {};

    // handle cross domain

    var match;
    var crossDomain = !!((match = /^([\w-]+:)?\/\/([^\/]+)/.exec(url)) && (match[2] != location.host));
    if (!crossDomain) {
      headers = {
        ...headers,
        'X-Requested-With': 'XMLHttpRequest',
      };
    }

    // handle query string
    if (options.qs) {
      url = handleQs(url, options.qs);
    }

    // handle json body
    if (options.json) {
      options.body = JSON.stringify(options.json);
      headers = {
        ...headers,
        'Content-Type': 'application/json',
      };
    }
  
    if (options.form) {
      options.body = (options.form as any);
    }

    if (options.timeout) {
      xhr.timeout = options.timeout;
      const start = Date.now();
      xhr.ontimeout = function () {
        var duration = Date.now() - start;
        var err = new Error('Request timed out after ' + duration + 'ms');
        (err as any).timeout = true;
        (err as any).duration = duration;
        reject(err);
      };
    }

    if (options.withCredentials) {
      xhr.withCredentials = options.withCredentials;
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var headers: {[key: string]: string} = {};
        xhr.getAllResponseHeaders().split('\r\n').forEach(header => {
          var h = header.split(':');
          if (h.length > 1) {
            headers[h[0].toLowerCase()] = h.slice(1).join(':').trim();
          }
        });
        var res = new GenericResponse(xhr.status, headers, xhr.responseText, url);
        resolve(res);
      }
    };

    // method, url, async
    xhr.open(method, url, true);

    for (var name in headers) {
      xhr.setRequestHeader(name, (headers[name] as string));
    }

    // avoid sending empty string (#319)
    xhr.send(options.body ? options.body : null);
  }));
}

const fd: any = FormData;
export {fd as FormData};
export default (request as RequestFn);

module.exports = request;
module.exports.default = request;
module.exports.FormData = fd;

