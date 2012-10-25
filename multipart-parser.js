/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  // TODO allow \r\r and \n\n for netcat debugging, etc
  var connect = require('connect')
    , PoorForm = require('./poor-form').PoorForm
    , fs = require('fs')
    , util = require('util')
    , app
    , server
    , count = 0
    ;

  // curl localhost:3000/uploadthings -X POST 
  app = connect.createServer()
    .use(function (req, res, next) {
        var emitter = PoorForm.create(req, res, next).emitter
          , fws
          ;

        if (!emitter) {
          return;
        }

        // loadstart
        // progress
        // load
        // abort
        // error
        // timeout
        // loadend

        emitter.on('loadstart', function (headers) {
          fws = fs.createWriteStream('file-' + count + '.jpg');
          count += 1;
          console.log('[filestart]');
          console.log(headers.join('\n'));
        });
        emitter.on('data', function (chunk) {
          fws.write(chunk);
          console.log('[progress]', chunk.length);
          if (chunk.length < 20) {
            console.log('so short');
            console.log(chunk.toString('utf8'));
            console.log('so done');
          } else {
            console.log('so long');
            console.log(chunk.slice(0,8).toString('utf8'));
            console.log(chunk.slice(chunk.length - 8, chunk.length).toString('utf8'));
            console.log('so lived');
          }
        });
        emitter.on('loadend', function () {
          fws.end();
          console.log('[fileend]');
        });
        emitter.on('end', function () {
          console.log('end of form');
          res.end('{ "success": true, "result": "Thanks for playing" }');
        });
      })
    ;

  server = app.listen(process.argv[2] || 3000, function () {
    console.log('Listening on', server.address());
  });
}());
