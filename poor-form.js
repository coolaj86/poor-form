/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  // TODO allow \r\r and \n\n for netcat debugging, etc
  var EventEmitter = require('events').EventEmitter
    , QuickParser = require('./quickParser')
    , CRLF = '\r\n'
    , CRLF_LEN = 2
    //, CRLFCRLF = '\r\n\r\n'
    , CRLFCRLF_LEN = 4
    //, DDCRLF = '--\r\n'
    //, DDCRLF_LEN = 4
    ;

  // NOTE if we're really trying to detect and correct villany
  // this is not a good parser. But for getting good user data
  // and ignoring villany, it should be good enough
  //
  // form-data; name="attachments[]"; filename="file1.txt"
  function formatContentDisposition(str) {
    // TODO make this less breakable
    return {
        "form-data": true
      , name: (str.match(/name="([^\"]+)"/mi)||[])[1]
      , filename: (str.match(/filename="([^\"]+)"/mi)||[])[1]
    };
  }

  // ^M
  // Content-Disposition: form-data; name="avatar"; filename="smiley-cool.png"^M
  // Content-Type: image/png^M
  // ^M
  function formatHeaders(str) {
    var headers = {}
      ;

    str.trim().split(CRLF).forEach(function (header) {
      var pair = /\s*(.+?)\s*:\s*(.+)\s*/.exec(header)
        ;

      // TODO check for existance before assignment?
      // (headers are technically arrays)
      headers[pair[1].toLowerCase()] = pair[2];
    });

    headers['content-disposition'] = formatContentDisposition(headers['content-disposition']);

    return headers;
  }

  function PoorForm(req) {
    if (!(this instanceof PoorForm)) {
      return new PoorForm(req);
    }

    var me = this
      , ctype = req.headers['content-type'] || ''
        // this could be chunked and have no length specified
      //, clength = req.headers['content-length']
      , boundString
      , boundBuffer
      ;

    me.req = req;
    me.theFirstTime = true;
    me.lastStart = null;
    me.lastChunkPartial = null;
    me.lastBuf = null;
    me.emitter = new EventEmitter();

    if (!/multipart\/form-data/i.test(ctype)) {
      me.emitter = null;
      return null;
    }

    // TODO the /m seems pointless? shouldn't this be on just one line?
    // I suppose the standard technically allows for \r and \n, but who does that?
    boundString = (ctype.match(/boundary=([^;]+)/mi)||[])[1];
    if (!boundString) {
      // TODO
      console.error('req.headers[..]: the multipart/form-data request is not HTTP-compliant, boundary string wasn\'t found..');
      me.emitter = null;
      return null;
    }

    //boundBuffer = new Buffer(boundString);
    boundBuffer = new Buffer('--' + boundString);
    me.bblength = boundBuffer.length;
    me.boundEnd = '--' + boundString + '--';
    me.qkp = new QuickParser.quickParser(boundBuffer);

    me._boundOnData = me._onData.bind(me);
    me._boundOnEnd = me._onEnd.bind(me);

    req.on('data', me._boundOnData);
    req.on('end', me._boundOnEnd);
  }
  PoorForm.prototype._onEnd = function onEnd() {
    var me = this
      ;

    //onData(null, cb);
    me.emitter.emit('realend');
  };
  PoorForm.prototype._onData = function onData(chunk) {
    var me = this
      , results
      , index = 0
      ;

    if (me.lastChunkPartial) {
      // I hope that Buffer.concat is more efficient than making a copy
      // but I don't know that it is.
      chunk = Buffer.concat([me.lastBuf, chunk], me.lastBuf.length + chunk.length);
      me.lastChunkPartial = false;
      me.lastStart = 0;
    }

    results = me.qkp.parse(chunk);

    results.some(function (result, i) {
      //console.log(result);
      var rstart = result.start
        , rfinish = result.finish
        //, headerLength = result.finish - (result.start + me.bblength + CRLF_LEN)
        //, bodyLength = result.finish - headerLength
        // note that end is not length
        // buf.slice([start], [end])
        , boundary
        , headers
        , headersStr
        , boundaryEnd = rstart + me.bblength + CRLF_LEN
        , sliceLen = chunk.length - rstart
        ;

      // rstart occurs just after \r\n
      if (rstart === 0) {
        // ignore
      } else if (rstart < CRLF_LEN) {
        console.error("rstart === 1? I don't see how that's possible.");
        return true; // break
      } else {
        // in all circumstances the chunk up to rstart is data
        // even if the last headers were partial, they have been
        // concatonated with the next chunk by this point
        // (in which case the length of the first body will be 0)
        me.emitter.emit('data', chunk.slice(index, rstart - CRLF_LEN));
        // in the case of partial headers,
        // make sure that lastBuf doesn't contain any data
        index = rstart; // skipping the CRLF
      }

      // NOTE
      // In the case of <boundary>\r\n<header> the chunk will larger than <boundary>\r\n
      // And the case of <boundary>-- 
      // we still know that boundaryEnd is at least that long
      if (chunk.length >= (boundaryEnd - rstart)) {
        boundary = chunk.slice(rstart, boundaryEnd);
        //console.log('[BOUNDARY]', boundary.toString('utf8'));
      }

      /*
      console.log('[CHUNK]', chunk.length, rstart, rfinish);
      console.log('[HLENG]', chunk.length - rstart);
      console.log('[HDLEN]', (rfinish + CRLF_LEN) - rstart);
      */

      if (sliceLen >= ((rfinish + CRLFCRLF_LEN) - rstart)) {
        // reaches double CRLF (end-of-header)
        headers = chunk.slice(
            boundaryEnd
          , rfinish + CRLFCRLF_LEN
        );
        headersStr = headers.toString('utf8');
        //console.log('[HEADERS]', headersStr);
        if (!/\r\n\r\n$/.test(headersStr)) {
          me.lastChunkPartial = true;
          me.lastStart = rstart;
        } else {
          index = rfinish + CRLFCRLF_LEN;
          if (index > chunk.length) {
            console.error('expected more bytes then what I have to give!');
          }
          //emitter.emit('rawboundary', boundary);
          //emitter.emit('rawheaders', headers);
          // TODO objectify
          if (!me.theFirstTime) {
            me.emitter.emit('loadend');
          } else {
            me.theFirstTime = false;
          }
          me.emitter.emit('loadstart', formatHeaders(headersStr));
        }
      } else if (sliceLen >= ((rfinish + CRLF_LEN) - rstart)) {
        // doesn't reach a single CRLF, probably a partial header
        headers = chunk.slice(
            boundaryEnd
          , rfinish + CRLF_LEN
        );
        headersStr = headers.toString('utf8');
        if (-1 === boundary.toString('utf8').indexOf(me.boundEnd)) {
          // This header was neither ended properly, nor a end-of-boundary marker
          // it must be rechecked later
          me.lastChunkPartial = true;
          me.lastStart = rstart;
        } else {
          // The header deos have the end-of-boundary marker
          index = rfinish + CRLF_LEN;
          if (index > chunk.length) {
            console.error('expected more bytes then what I got!');
          }
          me.emitter.emit('loadend');
          // this is an assumed end
          me.emitter.emit('end', boundary.toString('utf8'));
          me.req.removeListener('data', me._boundOnData);
          me.req.on('data', function (garb) {
            console.error('got unexpected data');
            console.log(garb);

            // The header didn't have the charactaristic \r\n\r\n
            // TODO this better had be the last chunk
            if (results.length - 1 !== i) {
              console.log(headersStr);
              console.log(headersStr.substr(headersStr.length - 4));
              console.error('MAJOR badness in the header malformation');
              console.error('[TODO] bail without attempt to recover');
            }
          });
        }
      }

    });

    if (index >= chunk.length) {
      // why would this happen?
      console.log('mismatch size index vs chunk.length, probably just a whitespace thing');
      return;
    }

    me.lastBuf = chunk.slice(index, chunk.length);
    if (!me.lastChunkPartial && 0 !== me.lastBuf.length) {
      me.emitter.emit('data', me.lastBuf);
      me.lastBuf = null;
    }
  };

  PoorForm.create = function (req) {
    return new PoorForm(req);
  };
  PoorForm.test = function (req) {
    var ctype = req.headers['content-type'] || ''
      ;

    if (/multipart\/form-data/i.test(ctype)) {
      return true;
    }
    return false;
  };

  module.exports.PoorForm = PoorForm;
}());
