/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var connect = require('connect')
    , PoorForm = require('./poor-form')
    , crypto = require('crypto')
    , port = process.argv[2] || 3000
    , server
    , app
    ;

  // An md5sum service
  app = connect.createServer()
    .use(function (req, res, next) {
        var emitter = PoorForm.create(req)
          , hash
          , info
          , hashes = []
          ;

        if (!emitter) {
          console.log("Either this was already parsed or it isn't a multi-part form");
          next();
          return;
        }

        emitter.on('fieldstart', function (headers) {
          console.log('[fieldstart]', headers.filename || headers.name);
          hash = crypto.createHash('md5');
          info = headers;
        });

        emitter.on('fielddata', function (chunk) {
          hash.update(chunk);
        });

        emitter.on('fieldend', function () {
          info.md5sum = hash.digest('hex');
          console.log(info.md5sum);
          hashes.push(info);
        });

        emitter.on('formend', function () {
          console.log('[formend]');
          res.end(JSON.stringify({ "success": true, "result": hashes }));
        });
      })
    ;

  server = app.listen(port, function () {
    console.log(server.address());
  });

}());