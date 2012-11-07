## PoorForm

PoorForm uses [formaline](https://github.com/rootslab/formaline)'s
ultra-fast parser to create a much simpler multi-part form parser.

It may be *insignificantly faster* than both formidable and formaline, but that's not the point.

**The point is** that it's a **simple base to build upon**, kitchen sink *not* included.

Truly a [formidable](https://github.com/felixge/node-formidable) competitor.

    npm install poor-form

## Test

    git clone git://github.com/coolaj86/poor-form.git
    cd poor-form
    npm install --dev
    node example-md5sum-service.js 4444 &
    node test/md5sum-test.js .

## API

  * [`PoorForm.create(req)`](#poorformcreaterequest)
  * [`PoorForm#on('fieldstart', fn)`](#poorformonfieldstart-function-headers---)
  * [`PoorForm#on('fielddata', fn)`](#poorformonfielddata-function-buffer---)
  * [`PoorForm#on('fieldend', fn)`](#poorformonfieldend-function----)
  * [`PoorForm#on('formend', fn)`](#poorformonformend-function----)
  * [`PoorForm#total`](#poorformloaded)
  * [`PoorForm#loaded`](#poorformtotal)

### PoorForm.create(request)

Returns a `PoorForm` emitter instance if `!req.complete` and `/multipart/.test(req.headers['content-type'])`.

Returns `null` otherwise - either it's not a multi-part form, or the form has already been parsed.

#### Example

```javascript
// Using Connect, for example
app.use(function (req, res, next) {
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

  // poorForm.on('fieldstart', ...)
  // ...
});
```

### PoorForm#on('fieldstart', function (headers) { ... })

Emitted each time a new field is encountered.

`headers` will contain all raw mime headers (with lower-cased keys) as well as a few shortcut keys

```javascript
headers = {
    name: "foo-fieldname"             // parsed value from Content-Disposition
  , filename: "big.bin"               // parsed value from Content-Disposition
  , type: "application/octet-stream"  // alias of Content-Type
  , 'content-type': "application/octet-stream"
  , 'content-disposition': 'form-data; name="foo-fieldname"; filename="big.bin"'
  , ...                               // any other raw headers (usually none)
}
```

#### Example

```javascript
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
```

### PoorForm#on('fielddata', function (buffer) { ... })

Emitted for each chunk of data that belongs to a field or file (no headers, whitespace, etc).

```javascript
poorForm.on('fielddata', function (buffer) {
  if (curField.fw) {
    curField.fw.write(buffer);
    console.log('Just wrote', buffer.length, 'bytes of a file');
  } else {
    curField.value += buffer.toString('utf8');
  }

  curField.totalBytes += buffer.length;
});
```

NOTE: It's very possible for a single field with very few bytes to come in with multiple chunks

### PoorForm#on('fieldend', function () { ... })

Emitted when the current field or file has completed.

```javascript
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

```

### PoorForm#on('formend', function () { ... })

Emitted when the end-of-form boundary has been encountered.

```javascript
poorForm.on('formend', function () {
  res.end(JSON.stringify(fields, null, '  '));
});
```

### PoorForm#loaded

Number of bytes received so far - including all headers, whitespace, form fields, and files.

```javascript
req.on('data', function () {
  var ratio = poorForm.loaded / poorForm.total
    , percent = Math.round(ratio * 100)
    ;

  console.log(percent + '% complete (' + poorForm.loaded + ' bytes)');
  // might be 0, if poorForm.total is Infinity
});
```

**TODO**: *Maybe* provide a `progress` event - just for the sake of knowing the event would fire after the byte count update.

### PoorForm#total

The total number of bytes in the form - the same as `req.headers['content-length']`.

```javascript
console.log(poorForm.total + 'bytes received thus far');
```

**NOTE**: If the content encoding is `chunked` poorForm.total will be `Infinity`.

Example: An md5sum webservice
===

```javascript
/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true eqeqeq:true immed:true latedef:true unused:true undef:true*/
(function () {
  "use strict";

  var connect = require('connect')
    , PoorForm = require('poor-form')
    , crypto = require('crypto')
    , port = process.argv[2] || 3000
    , server
    , app
    ;

  // An md5sum service
  app = connect.createServer()
    .use(function (req, res, next) {
        var poorForm = PoorForm.create(req)
          , hash
          , info
          , hashes = []
          ;

        if (!poorForm) {
          console.log("Either this was already parsed or it isn't a multi-part form");
          next();
          return;
        }

        poorForm.on('fieldstart', function (headers) {
          console.log('[fieldstart]', headers.filename || headers.name);
          hash = crypto.createHash('md5');
          info = headers;
        });

        poorForm.on('fielddata', function (chunk) {
          hash.update(chunk);
        });

        poorForm.on('fieldend', function () {
          info.md5sum = hash.digest('hex');
          console.log(info.md5sum);
          hashes.push(info);
        });

        poorForm.on('formend', function () {
          console.log('[formend]');
          res.end(JSON.stringify({ "success": true, "result": hashes }));
        });
      })
    ;

  server = app.listen(port, function () {
    console.log(server.address());
  });

}());
```
