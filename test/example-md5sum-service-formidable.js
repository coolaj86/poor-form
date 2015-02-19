/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var connect = require('connect')
    , formidable = require('formidable')
    , crypto = require('crypto')
    , port = process.argv[2] || 3000
    , server
    , app
    ;

  // An md5sum service
  app = connect.createServer()
    .use(function (req, res, next) {
        var form = new formidable.IncomingForm()
          , stats = { total: 0, hashTime: 0 }
          , hash
          , info
          , hashes = []
          , timestamp
          ;

        timestamp = Date.now();
        req.on('data', function (chunk) {
          stats.total += chunk.length;
        });
        form.onPart = function (part) {
          if (!part.filename) {
            // let formidable handle all non-file parts
            form.handlePart(part);
          }

          info = { name: part.filename };
          hash = crypto.createHash('md5');

          part.on('data', function (chunk) {
            var ts
              ;

            if (!info) {
              console.log('[fieldstart]', part);
            }
            ts = Date.now();
            hash.update(chunk);
            stats.hashTime += (Date.now() - ts);
          });

          part.on('end', function () {
            info.md5sum = hash.digest('hex');
            console.log('[fieldend]', info.md5sum);
            hashes.push(info);
          });
        };
        form.parse(req, function (/*err, fields, files*/) {
          var mibps = (stats.loaded / (1024 * 1024)) / (((Date.now() - timestamp) - stats.hashTime) / 1000)
            ;
          console.log('[formend]', (poorForm.hashTime / 1000).toFixed(3), mibps.toFixed(2), 'MiB/s\n');
          res.end(JSON.stringify({ "success": true, "result": hashes }, null, '  '));
        });

        form.parse(req, function (err, 
        if (!poorForm) {
          console.log("Either this was already parsed or it isn't a multi-part form");
          console.log(req.headers['content-type']);
          next();
          return;
        }

        timestamp = Date.now();
        poorForm.hashTime = 0;
        poorForm.on('fieldstart', function (headers) {
          console.log('[fieldstart]', headers.filename || headers.name);
          hash = crypto.createHash('md5');
          info = headers;
          info.size = 0;
        });

        poorForm.on('fielddata', function (chunk) {
          var ts
            ;
          //console.log('[fielddata]', chunk.length);
          info.size += chunk.length;

          hash.update(chunk);
        });

        poorForm.on('fieldend', function () {
          info.md5sum = hash.digest('hex');
          console.log('[fieldend]', info.md5sum);
          hashes.push(info);
        });

        poorForm.on('formend', function () {
        });
      })
    ;

  server = app.listen(port, function () {
    console.log('Listening on');
    console.log(server.address());
  });

}());
