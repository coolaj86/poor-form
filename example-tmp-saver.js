/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var connect = require('connect')
    , fs = require('fs')
    , PoorForm = require('./poor-form')
    , port = process.argv[2] || 3000
    , server
    , app
    ;

  // writes files to /tmp
  app = connect.createServer()
    .use(function (req, res, next) {
        var poorForm = PoorForm.create(req)
          , fields = []
          , count = 0
          , curField
          ;

        if (!poorForm) {
          console.log("Either this was already parsed or it isn't a multi-part form");
          next();
          return;
        }

        req.on('data', function () {
          var ratio = poorForm.loaded / poorForm.total
            , percent = Math.round(ratio * 100)
            ;

          console.log(percent + '% complete (' + poorForm.loaded + ' bytes)');
          // might be 0, if poorForm.total is Infinity
        });

        poorForm.on('fieldstart', function (headers) {
          var tmpPath = '/tmp/upload-' + count + '.bin'
            ;

          count += 1;
          curField = {};

          if (headers.filename) {
            console.log('Probably a file and probably has a mime-type', headers.type);
            curField.fw = fs.createWriteStream(tmpPath);
            curField.tmpPath = tmpPath;
          } else {
            console.log('Probably a field without a mime-type', headers.type);
            curField.value = '';
          }

          curField.totalBytes = 0;
          curField.headers = headers;
        });

        poorForm.on('fielddata', function (buffer) {
          if (curField.fw) {
            curField.fw.write(buffer);
            console.log('Just wrote', buffer.length, 'bytes of a file');
          } else {
            curField.value += buffer.toString('utf8');
          }

          curField.totalBytes += buffer.length;
        });

        poorForm.on('fieldend', function () {
          var lastField = curField
            ;

          if (curField.fw) {
            curField.fw.end();
            curField.fw = undefined;
            console.log('Just wrote a file of ', curField.totalBytes, 'bytes');
            fs.rename(curField.tmpPath, '/tmp/' + curField.headers.filename, function () {
              console.log('Renamed', lastField.tmpPath, 'to', lastField.headers.filename);
            });
          } else {
            console.log('Just received', curField.headers.name + ':' + curField.value);
          }

          fields.push(curField);
          curField = null;
        });

        poorForm.on('formend', function () {
          res.end(JSON.stringify(fields, null, '  '));
        });

      })
    ;

  server = app.listen(port, function () {
    console.log(server.address());
  });

}());
