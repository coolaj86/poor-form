/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true*/
(function () {
  "use strict";

  // TODO allow \r\r and \n\n for netcat debugging, etc
  var connect = require('connect')
    , EventEmitter = require('events').EventEmitter
    , QuickParser = require('./quickParser')
    , util = require('util')
    , app
    , server
    , CRLF = '\r\n'
    , CRLF_LEN = 2
    , CRLFCRLF = '\r\n\r\n'
    , CRLFCRLF_LEN = 4
    ;

  function poorform(req, res, next) {
    var things = {}
      , ctype = req.headers['content-type'] || ''
        // this could be chunked and have no length specified
      , clength = req.headers['content-length']
      , emitter = new EventEmitter()
      , boundString
      , boundBuffer
      , boundEnd
      , bblength
      , qkp
      , lastBuf
      , lastChunkPartial
      , lastStart
      , theFirstTime = true
      ;

    if (!/multipart\/form-data/i.test(ctype)) {
      next();
      return;
    }

    // TODO the /m seems pointless? shouldn't this be on just one line?
    // I suppose the standard technically allows for \r and \n, but who does that?
    boundString = (ctype.match(/boundary=([^;]+)/mi)||[])[1];
    if (!boundString) {
      // TODO
      console.error('req.headers[..]: the multipart/form-data request is not HTTP-compliant, boundary string wasn\'t found..');
      next();
      return;
    }

    //boundBuffer = new Buffer(boundString);
    boundBuffer = new Buffer('--' + boundString);
    bblength = boundBuffer.length;
    boundEnd = '--' + boundString + '--';
    qkp = new QuickParser.quickParser(boundBuffer);

    emitter.on('loadstart', function (headers) {
      console.log('[loadstart]');
      console.log(headers.toString());
    });
    emitter.on('data', function (chunk) {
      console.log('[data]', chunk.length);
    });
    emitter.on('loadend', function () {
      console.log('[loadend]');
    });
    emitter.on('end', function () {
      console.log('end of form');
    });

    function onData(chunk) {
      if (lastChunkPartial) {
        // I hope that Buffer.concat is more efficient than making a copy
        // but I don't know that it is.
        chunk = Buffer.concat([lastBuf, chunk], lastBuf.length + chunk.length);
        lastChunkPartial = false;
        lastStart = 0;
      }

      var results = qkp.parse(chunk)
        , index = 0
        ;

      results.forEach(function (result, i) {
        //console.log(result);
        var rstart = result.start
          , rfinish = result.finish
          , headerLength = result.finish - (result.start + bblength + CRLF_LEN)
          //, bodyLength = result.finish - headerLength
          // note that end is not length
          // buf.slice([start], [end])
          , body0 = chunk.slice(index, rstart)
          , boundary
          , headers
          , headersStr
          , boundaryEnd = rstart + bblength + CRLF_LEN
          , sliceLen = chunk.length - rstart
          ;

        // in all circumstances the chunk up to rstart is data
        // even if the last headers were partial, they have been
        // concatonated with the next chunk by this point
        // (in which case the length of the first body will be 0)
        if (0 !== body0.length) {
          emitter.emit('data', body0);
          // in the case of partial headers,
          // make sure that lastBuf doesn't contain any data
          index = rstart;
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
          if (/\r\n\r\n$/.test(headersStr)) {
            index = rfinish;
            //emitter.emit('rawboundary', boundary);
            //emitter.emit('rawheaders', headers);
            // TODO objectify
            if (!theFirstTime) {
              emitter.emit('loadend');
            } else {
              theFirstTime = false;
            }
            emitter.emit('loadstart', headersStr.trim().split(/\r\n/g));
          }
        } else if (sliceLen >= ((rfinish + CRLF_LEN) - rstart)) {
          // doesn't reach a single CRLF, probably a partial header
          headers = chunk.slice(
              boundaryEnd
            , rfinish + CRLF_LEN
          );
          headersStr = headers.toString('utf8');
          if (-1 !== boundary.toString('utf8').indexOf(boundEnd)) {
            // The header deos have the end-of-boundary marker
            index = rfinish + CRLF_LEN;
            emitter.emit('loadend');
            // this is an assumed end
            emitter.emit('end', boundary.toString('utf8'));
            req.removeListener('data', onData);
            req.on('data', function (garb) {
              console.error('got unexpected data');
              console.log(garb);
            });
          }
        }

        // The header didn't have the charactaristic \r\n\r\n
        // TODO this better had be the last chunk
        if (results.length - 1 !== i) {
          console.log(headersStr.substr(headersStr.length - 4));
          console.error('MAJOR badness in the header malformation');
          console.error('[TODO] bail without attempt to recover');
        }

        if (-1 !== headersStr.indexOf(boundEnd)) {
          // TODO why the indexOf?
          // perhaps it might have a trailing \r\n and might not?
          index = rfinish;
          return;
        }

        // This header was neither ended properly, nor a end-of-boundary marker
        // it must be rechecked later
        lastChunkPartial = true;
        lastStart = rstart;
        // lastBuf is always assigned
      });

      lastBuf = chunk.slice(index, chunk.length);

      if (!lastChunkPartial && 0 !== lastBuf.length) {
        emitter.emit('data', lastBuf);
      }
    }

    function onEnd() {
      //onData(null, cb);
      res.end();
    }

    req.on('data', onData);
    req.on('end', onEnd);
  }

  // curl localhost:3000/uploadthings -X POST 
  app = connect.createServer()
    .use(poorform)
    ;

  server = app.listen(process.argv[2] || 3000, function () {
    console.log('Listening on', server.address());
  });
}());
